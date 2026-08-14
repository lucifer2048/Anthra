package com.anthra.timer.activity

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class StepCounterManager(private val context: Context) {
  private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val mainHandler = Handler(Looper.getMainLooper())
  private var activeListener: SensorEventListener? = null
  private var timeoutRunnable: Runnable? = null

  init {
    synchronized(READING_LOCK) {
      if (preferences.getInt(KEY_STATE_FORMAT_VERSION, 1) < STATE_FORMAT_VERSION) {
        // Totals written by v1 may contain duplicated deltas from out-of-order
        // batched callbacks. They cannot be repaired reliably, so establish a
        // fresh cumulative baseline once when the corrected build is installed.
        preferences.edit()
          .remove(KEY_DAY)
          .remove(KEY_TIMEZONE)
          .remove(KEY_BOOT_COUNT)
          .remove(KEY_BASELINE_RAW)
          .remove(KEY_LAST_RAW)
          .remove(KEY_STEPS)
          .putInt(KEY_STATE_FORMAT_VERSION, STATE_FORMAT_VERSION)
          .apply()
      }
    }
  }

  fun hasStepCounter(): Boolean =
    sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

  fun hasPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) ==
        PackageManager.PERMISSION_GRANTED

  fun isTrackingEnabled(): Boolean = preferences.getBoolean(KEY_ENABLED, false)

  fun setTrackingEnabled(enabled: Boolean) {
    synchronized(READING_LOCK) {
      preferences.edit().putBoolean(KEY_ENABLED, enabled).apply()
      if (!enabled) {
        cancelReading()
        lastState()?.let { state ->
          savePendingDay(StepDaySnapshot(state.dayKey, state.timezone, state.steps))
        }
        preferences.edit().putLong(KEY_DISABLED_AT, System.currentTimeMillis()).apply()
      }
    }
  }

  fun recordReading(
    raw: Long,
    timezone: String = TimeZone.getDefault().id,
    observedAtMs: Long = System.currentTimeMillis()
  ): StepCounterUpdate? {
    synchronized(READING_LOCK) {
      if (!isTrackingEnabled()) return null
      val safeZone = TimeZone.getTimeZone(timezone)
      val dayKey = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = safeZone
      }.format(Date(observedAtMs))
      val storedState = lastState()
      val disabledAt = preferences.getLong(KEY_DISABLED_AT, 0L)
      val previous = if (
        disabledAt > 0L && storedState != null && storedState.dayKey != dayKey
      ) {
        // A multi-day disabled interval cannot be divided accurately from one
        // cumulative reading. Preserve the finalized old day and start a new
        // baseline instead of assigning the entire gap to today.
        null
      } else {
        storedState
      }
      val update = StepCounterNormalizer.update(
        previous = previous,
        rawReading = raw,
        dayKey = dayKey,
        timezone = safeZone.id,
        bootCount = currentBootCount(),
        permissionGranted = hasPermission()
      ) ?: return null

      if (disabledAt > 0L) preferences.edit().remove(KEY_DISABLED_AT).apply()

      if (
        update.rolledOverDayKey != null &&
        update.rolledOverTimezone != null &&
        update.rolledOverSteps != null
      ) {
        savePendingDay(
          StepDaySnapshot(
            update.rolledOverDayKey,
            update.rolledOverTimezone,
            update.rolledOverSteps
          )
        )
      }
      persist(update.state)
      return update
    }
  }

  fun pendingDays(): List<StepDaySnapshot> = synchronized(READING_LOCK) {
    readPendingDays()
  }

  private fun readPendingDays(): List<StepDaySnapshot> = runCatching {
    val values = JSONArray(preferences.getString(KEY_PENDING_DAYS, "[]") ?: "[]")
    buildList {
      for (index in 0 until values.length()) {
        val value = values.optJSONObject(index) ?: continue
        val dateKey = value.optString("dateKey")
        val timezone = value.optString("timezone")
        if (dateKey.isNotBlank() && timezone.isNotBlank()) {
          add(StepDaySnapshot(dateKey, timezone, value.optLong("steps").coerceAtLeast(0L)))
        }
      }
    }
  }.getOrDefault(emptyList())

  fun acknowledgePendingDays(dateKeys: Set<String>) {
    if (dateKeys.isEmpty()) return
    synchronized(READING_LOCK) {
      writePendingDays(readPendingDays().filterNot { it.dateKey in dateKeys })
    }
  }

  fun lastState(): StepCounterState? {
    val dayKey = preferences.getString(KEY_DAY, null) ?: return null
    val timezone = preferences.getString(KEY_TIMEZONE, null) ?: return null
    return StepCounterState(
      dayKey = dayKey,
      timezone = timezone,
      bootCount = preferences.getInt(KEY_BOOT_COUNT, -1),
      baselineRaw = preferences.getLong(KEY_BASELINE_RAW, -1L),
      lastRaw = preferences.getLong(KEY_LAST_RAW, -1L),
      steps = preferences.getLong(KEY_STEPS, 0L)
    )
  }

  fun requestReading(
    timezone: String,
    onSuccess: (raw: Long, update: StepCounterUpdate) -> Unit,
    onError: (code: String, message: String) -> Unit
  ) {
    cancelReading()
    if (!isTrackingEnabled()) {
      onError("TRACKING_DISABLED", "Phone step tracking is not enabled.")
      return
    }
    if (!hasStepCounter()) {
      onError("SENSOR_UNAVAILABLE", "This phone does not have a hardware step-counter sensor.")
      return
    }
    if (!hasPermission()) {
      onError("PERMISSION_DENIED", "Physical activity permission is not granted.")
      return
    }

    val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    if (sensor == null) {
      onError("SENSOR_UNAVAILABLE", "This phone does not have a hardware step-counter sensor.")
      return
    }

    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        val raw = event.values.firstOrNull()?.toLong() ?: -1L
        val update = recordReading(raw, timezone, wallTimeForSensorEvent(event.timestamp))
        cancelReading()
        if (update == null) {
          onError("INVALID_READING", "The phone returned an invalid step-counter reading.")
          return
        }
        onSuccess(raw, update)
      }

      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    activeListener = listener
    val registered = sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    if (!registered) {
      activeListener = null
      onError("SENSOR_REGISTRATION_FAILED", "The phone step-counter could not be started.")
      return
    }

    timeoutRunnable = Runnable {
      val previous = lastState()
      cancelReading()
      if (previous != null) {
        val fallback = StepCounterUpdate(previous)
        onSuccess(previous.lastRaw, fallback)
      } else {
        onError("SENSOR_TIMEOUT", "The step sensor has not produced its first reading yet.")
      }
    }.also { mainHandler.postDelayed(it, SENSOR_TIMEOUT_MS) }
  }

  fun cancelReading() {
    activeListener?.let(sensorManager::unregisterListener)
    activeListener = null
    timeoutRunnable?.let(mainHandler::removeCallbacks)
    timeoutRunnable = null
  }

  private fun persist(state: StepCounterState) {
    preferences.edit()
      .putString(KEY_DAY, state.dayKey)
      .putString(KEY_TIMEZONE, state.timezone)
      .putInt(KEY_BOOT_COUNT, state.bootCount)
      .putLong(KEY_BASELINE_RAW, state.baselineRaw)
      .putLong(KEY_LAST_RAW, state.lastRaw)
      .putLong(KEY_STEPS, state.steps)
      .apply()
  }

  private fun savePendingDay(snapshot: StepDaySnapshot) {
    val next = readPendingDays()
      .filterNot { it.dateKey == snapshot.dateKey }
      .plus(snapshot)
      .sortedBy { it.dateKey }
      .takeLast(MAX_PENDING_DAYS)
    writePendingDays(next)
  }

  private fun writePendingDays(days: List<StepDaySnapshot>) {
    val values = JSONArray()
    days.forEach { day ->
      values.put(JSONObject().apply {
        put("dateKey", day.dateKey)
        put("timezone", day.timezone)
        put("steps", day.steps)
      })
    }
    preferences.edit().putString(KEY_PENDING_DAYS, values.toString()).apply()
  }

  private fun currentBootCount(): Int =
    runCatching {
      Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT)
    }.getOrDefault(-1)

  private fun wallTimeForSensorEvent(eventTimestampNanos: Long): Long {
    if (eventTimestampNanos <= 0L) return System.currentTimeMillis()
    val ageNanos = (SystemClock.elapsedRealtimeNanos() - eventTimestampNanos).coerceAtLeast(0L)
    return System.currentTimeMillis() - ageNanos / 1_000_000L
  }

  companion object {
    private const val PREFS_NAME = "anthra_activity_steps_v1"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_DAY = "day_key"
    private const val KEY_TIMEZONE = "timezone"
    private const val KEY_BOOT_COUNT = "boot_count"
    private const val KEY_BASELINE_RAW = "baseline_raw"
    private const val KEY_LAST_RAW = "last_raw"
    private const val KEY_STEPS = "steps"
    private const val KEY_PENDING_DAYS = "pending_days"
    private const val KEY_DISABLED_AT = "disabled_at"
    private const val KEY_STATE_FORMAT_VERSION = "state_format_version"
    private const val STATE_FORMAT_VERSION = 2
    private const val MAX_PENDING_DAYS = 60
    private const val SENSOR_TIMEOUT_MS = 8_000L
    private val READING_LOCK = Any()
  }
}

data class StepDaySnapshot(
  val dateKey: String,
  val timezone: String,
  val steps: Long
)

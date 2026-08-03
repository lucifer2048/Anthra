package com.anthra.timer.alarm

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import androidx.core.content.ContextCompat

class AnthraAlarmModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var soundPickerPromise: Promise? = null

  private val activityListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: android.app.Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != SOUND_PICKER_REQUEST) return
      val promise = soundPickerPromise ?: return
      soundPickerPromise = null
      if (resultCode != android.app.Activity.RESULT_OK) {
        promise.reject("SOUND_PICKER_CANCELLED", "Sound selection was cancelled.")
        return
      }

      @Suppress("DEPRECATION")
      val selected = data?.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
      if (selected == null) {
        promise.reject("SOUND_REQUIRED", "Choose an alarm sound; silent alarms are not supported.")
        return
      }
      val title = runCatching {
        RingtoneManager.getRingtone(reactContext, selected)?.getTitle(reactContext)
      }.getOrNull().orEmpty().ifBlank { "Selected device alarm" }
      promise.resolve(Arguments.createMap().apply {
        putString("uri", selected.toString())
        putString("name", title)
      })
    }
  }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun getName(): String = "AnthraAlarm"

  @ReactMethod
  fun scheduleAlarm(source: ReadableMap, promise: Promise) {
    try {
      val requiresPushups = !source.hasKey("requiresPushups") || source.isNull("requiresPushups") || source.getBoolean("requiresPushups")
      if (
        requiresPushups &&
        ContextCompat.checkSelfPermission(reactContext, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
      ) {
        throw SecurityException("Allow Camera access before enabling a push-up alarm.")
      }
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(reactContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
      ) {
        throw SecurityException("Allow Notifications before enabling this alarm.")
      }
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
        reactContext.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() != true
      ) {
        throw SecurityException("Allow full-screen alarms before enabling this alarm.")
      }
      val daysArray = source.getArray("days")
      val days = buildList {
        if (daysArray != null) {
          for (index in 0 until daysArray.size()) {
            val day = daysArray.getInt(index)
            if (day in 0..6 && !contains(day)) add(day)
          }
        }
      }.ifEmpty { listOf(0, 1, 2, 3, 4, 5, 6) }

      val config = AlarmConfig(
        id = source.getInt("id"),
        label = source.getString("label").orEmpty().ifBlank { "Push-up alarm" }.take(80),
        hour = source.getInt("hour").coerceIn(0, 23),
        minute = source.getInt("minute").coerceIn(0, 59),
        days = days,
        pushupTarget = source.getInt("pushupTarget").coerceIn(1, 100),
        soundUri = source.getString("soundUri").orEmpty(),
        soundName = source.getString("soundName").orEmpty().ifBlank { "System alarm" }.take(120),
        enabled = source.getBoolean("enabled"),
        timezone = if (source.hasKey("timezone") && !source.isNull("timezone")) {
          source.getString("timezone").orEmpty().ifBlank { AlarmStore.TIMEZONE }.take(80)
        } else AlarmStore.TIMEZONE,
        requiresPushups = requiresPushups
      )
      val nextTriggerAt = AlarmScheduler.schedule(reactContext, config)
      promise.resolve(Arguments.createMap().apply { putDouble("nextTriggerAt", nextTriggerAt.toDouble()) })
    } catch (error: Throwable) {
      promise.reject("ALARM_SCHEDULE_FAILED", error.message ?: "Could not schedule the alarm.", error)
    }
  }

  @ReactMethod
  fun cancelAlarm(alarmId: Int, promise: Promise) {
    runCatching { AlarmScheduler.cancel(reactContext, alarmId, removeStoredConfig = true) }
      .onSuccess { promise.resolve(null) }
      .onFailure { promise.reject("ALARM_CANCEL_FAILED", it.message, it) }
  }

  @ReactMethod
  fun clearAllAlarms(promise: Promise) {
    runCatching {
      AlarmStore.all(reactContext).filter { it.id > 0 }.forEach { config ->
        AlarmScheduler.cancel(reactContext, config.id, removeStoredConfig = false)
        AlarmStore.remove(reactContext, config.id)
      }
    }.onSuccess { promise.resolve(null) }
      .onFailure { promise.reject("ALARM_CLEAR_FAILED", it.message, it) }
  }

  @ReactMethod
  fun pickAlarmSound(currentUri: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Open Anthra before choosing an alarm sound.")
      return
    }
    if (soundPickerPromise != null) {
      promise.reject("SOUND_PICKER_OPEN", "The alarm sound picker is already open.")
      return
    }
    soundPickerPromise = promise
    val existing = currentUri.takeIf { it.isNotBlank() }?.let(Uri::parse)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
      putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
      putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Choose Anthra alarm sound")
      putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
      putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
      putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, existing)
    }
    runCatching { activity.startActivityForResult(intent, SOUND_PICKER_REQUEST) }
      .onFailure {
        soundPickerPromise = null
        promise.reject("SOUND_PICKER_FAILED", it.message, it)
      }
  }

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    val exact = AlarmScheduler.canScheduleExact(reactContext)
    val fullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      reactContext.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() == true
    } else true
    promise.resolve(Arguments.createMap().apply {
      putBoolean("nativeSupported", true)
      putBoolean("exactAlarm", exact)
      putBoolean("fullScreenIntent", fullScreen)
    })
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || AlarmScheduler.canScheduleExact(reactContext)) {
      promise.resolve(null)
      return
    }
    openSettingsIntent(
      Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${reactContext.packageName}")),
      promise
    )
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      promise.resolve(null)
      return
    }
    openSettingsIntent(
      Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${reactContext.packageName}")),
      promise
    )
  }

  @ReactMethod
  fun startTestChallenge(target: Int, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Open Anthra before testing push-up tracking.")
      return
    }
    runCatching {
      activity.startActivity(Intent(activity, AlarmChallengeActivity::class.java).apply {
        putExtra(AlarmStore.EXTRA_TEST_MODE, true)
        putExtra(AlarmStore.EXTRA_TEST_TARGET, target.coerceIn(1, 100))
      })
    }.onSuccess { promise.resolve(null) }
      .onFailure { promise.reject("TEST_CHALLENGE_FAILED", it.message, it) }
  }

  @ReactMethod
  fun consumeCompletionEvents(promise: Promise) {
    runCatching {
      val source = AlarmStore.consumeCompletions(reactContext)
      Arguments.createArray().apply {
        for (index in 0 until source.length()) {
          val entry = source.optJSONObject(index) ?: continue
          pushMap(Arguments.createMap().apply {
            putString("eventId", entry.optString("eventId"))
            if (entry.isNull("alarmId")) putNull("alarmId") else putInt("alarmId", entry.optInt("alarmId"))
            putString("label", entry.optString("label", "Push-up alarm"))
            putDouble("firedAt", entry.optLong("firedAt").toDouble())
            putDouble("completedAt", entry.optLong("completedAt").toDouble())
            putInt("targetReps", entry.optInt("targetReps"))
            putInt("completedReps", entry.optInt("completedReps"))
            putString("status", entry.optString("status", "completed"))
          })
        }
      }
    }.onSuccess(promise::resolve)
      .onFailure { promise.reject("COMPLETION_SYNC_FAILED", it.message, it) }
  }

  private fun openSettingsIntent(intent: Intent, promise: Promise) {
    runCatching {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
    }.onSuccess { promise.resolve(null) }
      .onFailure { promise.reject("SETTINGS_FAILED", it.message, it) }
  }

  companion object {
    private const val SOUND_PICKER_REQUEST = 74_210
  }
}

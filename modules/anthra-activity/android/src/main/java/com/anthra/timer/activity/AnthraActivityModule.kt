package com.anthra.timer.activity

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class AnthraActivityModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val stepCounter = StepCounterManager(reactContext)
  private val healthConnect = HealthConnectManager(reactContext)
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var permissionPromise: Promise? = null

  private val activityListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
    ) {
      if (requestCode != HEALTH_PERMISSION_REQUEST_CODE) return
      val promise = permissionPromise ?: return
      permissionPromise = null
      runCatching {
        healthConnect.permissionContract.parseResult(resultCode, data)
      }.onSuccess { granted ->
        val result = Arguments.createMap().apply {
          putBoolean("stepsPermission", granted.any { it.endsWith("READ_STEPS") })
          putBoolean("exercisePermission", granted.any { it.endsWith("READ_EXERCISE") })
        }
        promise.resolve(result)
      }.onFailure { error ->
        promise.reject("HEALTH_PERMISSION_FAILED", error.message, error)
      }
    }
  }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun getName(): String = "AnthraActivity"

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    val result = Arguments.createMap().apply {
      putString("platform", "android")
      putInt("apiLevel", Build.VERSION.SDK_INT)
      putBoolean("stepCounterAvailable", stepCounter.hasStepCounter())
      putBoolean("activityRecognitionRequired", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
      putString("healthConnectAvailability", healthConnect.availability())
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun getPhoneStepStatus(promise: Promise) {
    if (stepCounter.isTrackingEnabled() && stepCounter.hasPermission() && stepCounter.hasStepCounter()) {
      runCatching { StepTrackingService.start(reactContext.applicationContext) }
    }
    val state = stepCounter.lastState()
    val result = Arguments.createMap().apply {
      putBoolean("sensorAvailable", stepCounter.hasStepCounter())
      putBoolean("permissionGranted", stepCounter.hasPermission())
      putBoolean("trackingEnabled", stepCounter.isTrackingEnabled())
      if (state == null) {
        putNull("dateKey")
        putNull("timezone")
        putNull("lastRaw")
        putDouble("steps", 0.0)
      } else {
        putString("dateKey", state.dayKey)
        putString("timezone", state.timezone)
        putDouble("lastRaw", state.lastRaw.toDouble())
        putDouble("steps", state.steps.toDouble())
      }
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun setPhoneStepTrackingEnabled(enabled: Boolean, promise: Promise) {
    runCatching {
      if (enabled && (!stepCounter.hasStepCounter() || !stepCounter.hasPermission())) {
        throw IllegalStateException("The step sensor or physical activity permission is unavailable.")
      }
      stepCounter.setTrackingEnabled(enabled)
      if (enabled) {
        StepTrackingService.start(reactContext.applicationContext)
      } else {
        StepTrackingService.stop(reactContext.applicationContext)
      }
    }.onSuccess {
      promise.resolve(null)
    }.onFailure { error ->
      stepCounter.setTrackingEnabled(false)
      promise.reject("STEP_TRACKING_SERVICE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getPendingPhoneStepDays(promise: Promise) {
    val result = Arguments.createArray()
    stepCounter.pendingDays().forEach { day ->
      result.pushMap(Arguments.createMap().apply {
        putString("dateKey", day.dateKey)
        putString("timezone", day.timezone)
        putDouble("steps", day.steps.toDouble())
      })
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun acknowledgePendingPhoneStepDays(dateKeys: com.facebook.react.bridge.ReadableArray, promise: Promise) {
    val keys = buildSet {
      for (index in 0 until dateKeys.size()) {
        dateKeys.getString(index)?.let(::add)
      }
    }
    stepCounter.acknowledgePendingDays(keys)
    promise.resolve(null)
  }

  @ReactMethod
  fun getCurrentRawStepReading(timezone: String, promise: Promise) {
    stepCounter.requestReading(
      timezone = timezone,
      onSuccess = { _, update ->
        val result = Arguments.createMap().apply {
          // A stale callback can be ignored by the normalizer. Return the
          // accepted cumulative value so JS never stores a regressed checkpoint.
          putDouble("raw", update.state.lastRaw.toDouble())
          putString("dateKey", update.state.dayKey)
          putString("timezone", update.state.timezone)
          putDouble("baselineRaw", update.state.baselineRaw.toDouble())
          putDouble("steps", update.state.steps.toDouble())
          putBoolean("counterReset", update.counterReset)
          putBoolean("rebootDetected", update.rebootDetected)
          putBoolean("timezoneChanged", update.timezoneChanged)
          update.rolledOverDayKey?.let { putString("rolledOverDayKey", it) }
            ?: putNull("rolledOverDayKey")
          update.rolledOverTimezone?.let { putString("rolledOverTimezone", it) }
            ?: putNull("rolledOverTimezone")
          update.rolledOverSteps?.let { putDouble("rolledOverSteps", it.toDouble()) }
            ?: putNull("rolledOverSteps")
        }
        promise.resolve(result)
      },
      onError = { code, message -> promise.reject(code, message) }
    )
  }

  @ReactMethod
  fun cancelCurrentRawStepReading() {
    stepCounter.cancelReading()
  }

  @ReactMethod
  fun getHealthConnectStatus(promise: Promise) {
    scope.launch {
      runCatching { healthConnect.status() }
        .onSuccess { status ->
          val result = Arguments.createMap().apply {
            putString("availability", status.availability)
            putBoolean("stepsPermission", status.stepsPermission)
            putBoolean("exercisePermission", status.exercisePermission)
            putBoolean("connected", status.connected)
          }
          promise.resolve(result)
        }
        .onFailure { error ->
          promise.reject("HEALTH_STATUS_FAILED", error.message, error)
        }
    }
  }

  @ReactMethod
  fun requestHealthConnectPermissions(promise: Promise) {
    if (healthConnect.availability() != "available") {
      promise.reject("HEALTH_UNAVAILABLE", "Health Connect is not available.")
      return
    }
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Anthra must be in the foreground to connect health data.")
      return
    }
    if (permissionPromise != null) {
      promise.reject("REQUEST_IN_PROGRESS", "A Health Connect permission request is already open.")
      return
    }
    permissionPromise = promise
    val intent = healthConnect.permissionContract.createIntent(
      reactContext,
      healthConnect.requestedPermissions
    )
    activity.startActivityForResult(intent, HEALTH_PERMISSION_REQUEST_CODE)
  }

  @ReactMethod
  fun readHealthConnectDailyTotals(
    startTimeMs: Double,
    endTimeMs: Double,
    timezone: String,
    promise: Promise
  ) {
    scope.launch {
      runCatching {
        healthConnect.readDailyTotals(startTimeMs.toLong(), endTimeMs.toLong(), timezone)
      }.onSuccess { totals ->
        val result = Arguments.createArray()
        totals.forEach { total ->
          result.pushMap(Arguments.createMap().apply {
            putString("dateKey", total.dateKey)
            putString("timezone", total.timezone)
            total.steps?.let { putDouble("steps", it.toDouble()) } ?: putNull("steps")
            putArray("originPackages", Arguments.fromList(total.originPackages))
          })
        }
        promise.resolve(result)
      }.onFailure { error ->
        promise.reject("HEALTH_STEPS_READ_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun readHealthConnectWorkouts(
    startTimeMs: Double,
    endTimeMs: Double,
    promise: Promise
  ) {
    scope.launch {
      runCatching {
        healthConnect.readWorkouts(startTimeMs.toLong(), endTimeMs.toLong())
      }.onSuccess { workouts ->
        val result = Arguments.createArray()
        workouts.forEach { workout ->
          result.pushMap(Arguments.createMap().apply {
            putString("externalId", workout.externalId)
            workout.clientRecordId?.let { putString("clientRecordId", it) }
              ?: putNull("clientRecordId")
            putDouble("clientRecordVersion", workout.clientRecordVersion.toDouble())
            putString("originPackage", workout.originPackage)
            workout.title?.let { putString("title", it) } ?: putNull("title")
            putInt("exerciseType", workout.exerciseType)
            putDouble("startTime", workout.startTime.toDouble())
            putDouble("endTime", workout.endTime.toDouble())
            putDouble("lastModifiedTime", workout.lastModifiedTime.toDouble())
          })
        }
        promise.resolve(result)
      }.onFailure { error ->
        promise.reject("HEALTH_WORKOUT_READ_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun openHealthConnectSettings(promise: Promise) {
    runCatching {
      if (healthConnect.availability() == "update_required") {
        val marketIntent = Intent(
          Intent.ACTION_VIEW,
          Uri.parse("market://details?id=com.google.android.apps.healthdata")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { reactContext.startActivity(marketIntent) }
          .getOrElse {
            reactContext.startActivity(
              Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata")
              ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
          }
      } else {
        val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
      }
    }.onSuccess {
      promise.resolve(null)
    }.onFailure { error ->
      promise.reject("HEALTH_SETTINGS_FAILED", error.message, error)
    }
  }

  override fun invalidate() {
    stepCounter.cancelReading()
    permissionPromise?.reject("MODULE_INVALIDATED", "Activity Buddy closed.")
    permissionPromise = null
    scope.cancel()
    reactContext.removeActivityEventListener(activityListener)
    super.invalidate()
  }

  companion object {
    private const val HEALTH_PERMISSION_REQUEST_CODE = 4917
  }
}

package com.anthra.timer.activity

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.anthra.timer.MainActivity
import com.anthra.timer.R
import java.util.TimeZone

/** Keeps the low-power hardware step counter subscribed while Anthra is backgrounded. */
class StepTrackingService : Service(), SensorEventListener {
  private lateinit var sensorManager: SensorManager
  private lateinit var stepCounter: StepCounterManager
  private var registered = false

  override fun onCreate() {
    super.onCreate()
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepCounter = StepCounterManager(applicationContext)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!stepCounter.isTrackingEnabled() || !stepCounter.hasPermission()) {
      stopSelf()
      return START_NOT_STICKY
    }
    startAsForeground()
    registerSensor()
    return START_STICKY
  }

  override fun onDestroy() {
    if (registered) sensorManager.unregisterListener(this)
    registered = false
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onSensorChanged(event: SensorEvent) {
    val raw = event.values.firstOrNull()?.toLong() ?: return
    stepCounter.recordReading(raw, TimeZone.getDefault().id)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  private fun registerSensor() {
    if (registered) return
    val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: run {
      stopSelf()
      return
    }
    registered = sensorManager.registerListener(
      this,
      sensor,
      SensorManager.SENSOR_DELAY_NORMAL
    )
    if (!registered) stopSelf()
  }

  private fun startAsForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val launchIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon_anthra)
      .setContentTitle(getString(R.string.step_tracking_notification_title))
      .setContentText(getString(R.string.step_tracking_notification_text))
      .setContentIntent(pendingIntent)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.step_tracking_channel_name),
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = getString(R.string.step_tracking_channel_description)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "anthra_step_tracking"
    private const val NOTIFICATION_ID = 4202
    fun start(context: Context) {
      val intent = Intent(context, StepTrackingService::class.java)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, StepTrackingService::class.java))
    }
  }
}

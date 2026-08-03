package com.anthra.timer.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import com.anthra.timer.R

class AlarmRingingService : Service() {
  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var vibrator: Vibrator? = null

  override fun onCreate() {
    super.onCreate()
    createChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    val alarmId = intent?.getIntExtra(AlarmStore.EXTRA_ALARM_ID, -1) ?: -1
    val firedAt = intent?.getLongExtra(AlarmStore.EXTRA_FIRED_AT, System.currentTimeMillis())
      ?: System.currentTimeMillis()
    val config = AlarmStore.get(this, alarmId)
    if (config == null) {
      stopSelf()
      return START_NOT_STICKY
    }

    acquireWakeLock()
    startForeground(NOTIFICATION_ID, buildNotification(config, firedAt))
    startRinging(config.soundUri)
    return START_REDELIVER_INTENT
  }

  override fun onDestroy() {
    player?.runCatching { stop() }
    player?.release()
    player = null
    vibrator?.cancel()
    vibrator = null
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val manager = getSystemService(PowerManager::class.java) ?: return
    wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Anthra:PushupAlarm").apply {
      setReferenceCounted(false)
      acquire(30 * 60 * 1_000L)
    }
  }

  private fun buildNotification(config: AlarmConfig, firedAt: Long): Notification {
    val alarmActivity = if (config.requiresPushups) AlarmChallengeActivity::class.java else RegularAlarmActivity::class.java
    val alarmIntent = Intent(this, alarmActivity).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(AlarmStore.EXTRA_ALARM_ID, config.id)
      putExtra(AlarmStore.EXTRA_FIRED_AT, firedAt)
    }
    val alarmPending = PendingIntent.getActivity(
      this,
      config.id,
      alarmIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val channelId = if (config.requiresPushups) PUSHUP_CHANNEL_ID else WORKOUT_CHANNEL_ID
    val builder = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(R.drawable.notification_icon_anthra)
      .setContentTitle(config.label)
      .setContentText(
        if (config.requiresPushups) {
          "Complete ${config.pushupTarget} verified push-ups to dismiss"
        } else {
          "Workout reminder · tap Dismiss to stop the alarm"
        }
      )
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(alarmPending)
      .setFullScreenIntent(alarmPending, true)
      .setSound(null)
      .setVibrate(null)

    if (!config.requiresPushups) {
      val dismissIntent = PendingIntent.getActivity(
        this,
        config.id + 200_000,
        Intent(this, RegularAlarmActivity::class.java).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
          putExtra(AlarmStore.EXTRA_ALARM_ID, config.id)
          putExtra(AlarmStore.EXTRA_DISMISS, true)
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      builder.addAction(0, "Dismiss", dismissIntent)
    }
    return builder.build()
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val pushupChannel = NotificationChannel(
      PUSHUP_CHANNEL_ID,
      "Push-up alarms",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Full-screen Anthra alarms dismissed by completing push-ups."
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setSound(null, null)
      enableVibration(false)
    }
    val workoutChannel = NotificationChannel(
      WORKOUT_CHANNEL_ID,
      "Workout alarms",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Regular full-screen workout reminder alarms with a dismiss button."
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setSound(null, null)
      enableVibration(false)
    }
    manager.createNotificationChannels(listOf(pushupChannel, workoutChannel))
  }

  private fun startRinging(selectedUri: String) {
    player?.release()
    val primary = selectedUri.takeIf { it.isNotBlank() }?.let(Uri::parse)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

    player = createPlayer(primary) ?: createPlayer(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
    player?.start()

    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    val pattern = longArrayOf(0, 700, 300, 700, 700)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
    } else {
      @Suppress("DEPRECATION")
      vibrator?.vibrate(pattern, 0)
    }
  }

  private fun createPlayer(uri: Uri?): MediaPlayer? {
    if (uri == null) return null
    return runCatching {
      MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        )
        setDataSource(this@AlarmRingingService, uri)
        isLooping = true
        prepare()
      }
    }.getOrNull()
  }

  companion object {
    const val ACTION_START = "com.anthra.timer.alarm.START"
    const val ACTION_STOP = "com.anthra.timer.alarm.STOP"
    private const val PUSHUP_CHANNEL_ID = "anthra-pushup-alarms-v1"
    private const val WORKOUT_CHANNEL_ID = "anthra-workout-alarms-v1"
    private const val NOTIFICATION_ID = 7_410

    fun stop(context: Context) {
      context.startService(Intent(context, AlarmRingingService::class.java).apply { action = ACTION_STOP })
    }
  }
}

package com.anthra.timer.alarm

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.util.Calendar
import java.util.TimeZone

object AlarmScheduler {

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val manager = context.getSystemService(AlarmManager::class.java) ?: return false
    return manager.canScheduleExactAlarms()
  }

  fun canPresentAlarm(context: Context, requiresPushups: Boolean): Boolean {
    if (
      requiresPushups &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
      context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() != true
    ) {
      return false
    }
    return true
  }

  fun schedule(context: Context, config: AlarmConfig, afterMillis: Long = System.currentTimeMillis()): Long {
    AlarmStore.save(context, config)
    cancelPending(context, config.id)
    if (!config.enabled) return 0L
    if (!canScheduleExact(context)) {
      throw SecurityException("Allow ‘Alarms & reminders’ for Anthra, then enable the alarm again.")
    }

    val triggerAt = nextTrigger(config, afterMillis)
    val manager = context.getSystemService(AlarmManager::class.java)
      ?: throw IllegalStateException("Android AlarmManager is unavailable.")

    val receiverIntent = Intent(context, AlarmReceiver::class.java).apply {
      action = "com.anthra.timer.PUSHUP_ALARM"
      putExtra(AlarmStore.EXTRA_ALARM_ID, config.id)
    }
    val receiver = PendingIntent.getBroadcast(
      context,
      config.id,
      receiverIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val showActivityIntent =
      (context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(Intent.ACTION_MAIN).apply {
          addCategory(Intent.CATEGORY_LAUNCHER)
          setPackage(context.packageName)
        }).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
    val showIntent = PendingIntent.getActivity(
      context,
      config.id + 100_000,
      showActivityIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    manager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, showIntent), receiver)
    return triggerAt
  }

  fun cancel(context: Context, alarmId: Int, removeStoredConfig: Boolean) {
    cancelPending(context, alarmId)
    if (removeStoredConfig) AlarmStore.remove(context, alarmId)
  }

  fun rescheduleAll(context: Context) {
    AlarmStore.all(context)
      .filter { it.enabled && canPresentAlarm(context, it.requiresPushups) }
      .forEach { config -> runCatching { schedule(context, config) } }
  }

  private fun cancelPending(context: Context, alarmId: Int) {
    val manager = context.getSystemService(AlarmManager::class.java) ?: return
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      action = "com.anthra.timer.PUSHUP_ALARM"
    }
    val pending = PendingIntent.getBroadcast(
      context,
      alarmId,
      intent,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    ) ?: return
    manager.cancel(pending)
    pending.cancel()
  }

  internal fun nextTrigger(config: AlarmConfig, afterMillis: Long): Long {
    val alarmTimeZone = TimeZone.getTimeZone(config.timezone)
    val now = Calendar.getInstance(alarmTimeZone).apply { timeInMillis = afterMillis }
    for (offset in 0..8) {
      val candidate = (now.clone() as Calendar).apply {
        add(Calendar.DAY_OF_YEAR, offset)
        set(Calendar.HOUR_OF_DAY, config.hour)
        set(Calendar.MINUTE, config.minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      val sundayBasedWeekday = candidate.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
      if (!config.days.contains(sundayBasedWeekday)) continue
      val timestamp = candidate.timeInMillis
      if (timestamp > afterMillis + 1_000L) return timestamp
    }
    throw IllegalStateException("Could not determine the next alarm time in ${config.timezone}.")
  }
}

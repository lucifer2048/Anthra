package com.anthra.timer.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val alarmId = intent.getIntExtra(AlarmStore.EXTRA_ALARM_ID, -1)
    val config = AlarmStore.get(context, alarmId) ?: return
    if (!config.enabled) return

    val firedAt = System.currentTimeMillis()
    runCatching { AlarmScheduler.schedule(context, config, firedAt + 2_000L) }
    // Camera access is required only for Alarm Buddy's push-up challenge.
    if (!AlarmScheduler.canPresentAlarm(context, config.requiresPushups)) return

    val serviceIntent = Intent(context, AlarmRingingService::class.java).apply {
      action = AlarmRingingService.ACTION_START
      putExtra(AlarmStore.EXTRA_ALARM_ID, alarmId)
      putExtra(AlarmStore.EXTRA_FIRED_AT, firedAt)
    }
    ContextCompat.startForegroundService(context, serviceIntent)
  }
}

package com.anthra.timer.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    Thread {
      try {
        AlarmScheduler.rescheduleAll(context.applicationContext)
      } finally {
        pending.finish()
      }
    }.start()
  }
}

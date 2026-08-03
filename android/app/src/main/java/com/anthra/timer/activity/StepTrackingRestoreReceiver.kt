package com.anthra.timer.activity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class StepTrackingRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action !in setOf(
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_MY_PACKAGE_REPLACED,
        Intent.ACTION_TIME_CHANGED,
        Intent.ACTION_TIMEZONE_CHANGED
      )
    ) return

    val manager = StepCounterManager(context.applicationContext)
    if (manager.isTrackingEnabled() && manager.hasPermission() && manager.hasStepCounter()) {
      runCatching { StepTrackingService.start(context.applicationContext) }
    }
  }
}

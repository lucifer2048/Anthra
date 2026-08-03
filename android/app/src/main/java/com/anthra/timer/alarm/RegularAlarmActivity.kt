package com.anthra.timer.alarm

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Full-screen, normally dismissible alarm used by workout reminders only. */
class RegularAlarmActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    if (dismissIfRequested()) return
    buildLayout()
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        moveTaskToBack(true)
      }
    })
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (dismissIfRequested()) return
    buildLayout()
  }

  private fun dismissIfRequested(): Boolean {
    if (!intent.getBooleanExtra(AlarmStore.EXTRA_DISMISS, false)) return false
    AlarmRingingService.stop(this)
    finishAndRemoveTask()
    return true
  }

  private fun buildLayout() {
    val alarmId = intent.getIntExtra(AlarmStore.EXTRA_ALARM_ID, -1)
    val config = AlarmStore.get(this, alarmId)
    if (config == null || config.requiresPushups) {
      finish()
      return
    }

    val time = SimpleDateFormat("h:mm a", Locale.getDefault()).apply {
      timeZone = TimeZone.getTimeZone(config.timezone)
    }.format(Date())

    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(28), dp(48), dp(28), dp(48))
      setBackgroundColor(Color.rgb(7, 7, 7))
    }
    content.addView(TextView(this).apply {
      text = "WORKOUT REMINDER"
      setTextColor(Color.rgb(255, 82, 99))
      textSize = 15f
      letterSpacing = 0.12f
      gravity = Gravity.CENTER
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    })
    content.addView(TextView(this).apply {
      text = time
      setTextColor(Color.WHITE)
      textSize = 54f
      gravity = Gravity.CENTER
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      setPadding(0, dp(16), 0, 0)
    })
    content.addView(TextView(this).apply {
      text = config.label
      setTextColor(Color.rgb(214, 204, 206))
      textSize = 22f
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, dp(40))
    })
    content.addView(Button(this).apply {
      text = "Dismiss"
      textSize = 18f
      setTextColor(Color.WHITE)
      background = GradientDrawable().apply {
        setColor(Color.rgb(224, 30, 58))
        cornerRadius = dp(18).toFloat()
      }
      setOnClickListener {
        AlarmRingingService.stop(this@RegularAlarmActivity)
        finishAndRemoveTask()
      }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)))
    setContentView(content)
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}

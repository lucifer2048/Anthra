package com.anthra.timer.activity

import android.app.Activity
import android.os.Bundle
import android.text.method.LinkMovementMethod
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class HealthPermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    title = "Activity Buddy privacy"

    val density = resources.displayMetrics.density
    val padding = (24 * density).toInt()
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padding, padding, padding, padding)
      addView(TextView(context).apply {
        text = "Activity Buddy & Health Connect"
        textSize = 24f
      })
      addView(TextView(context).apply {
        text =
          "\nAnthra reads your step totals and exercise sessions only after you choose to connect Health Connect. " +
          "This information is stored locally on this device to show daily progress, history, and your Activity Streak.\n\n" +
          "Anthra does not upload, sell, or share health information. Health information is excluded from normal Anthra JSON backups. " +
          "You can revoke access at any time from Health Connect settings."
        textSize = 16f
        movementMethod = LinkMovementMethod.getInstance()
      })
      addView(Button(context).apply {
        text = "Done"
        setOnClickListener { finish() }
      })
    }
    setContentView(ScrollView(this).apply {
      addView(
        layout,
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT
        )
      )
    })
  }
}

package com.anthra.timer.activity

import kotlin.math.max

data class StepCounterState(
  val dayKey: String,
  val timezone: String,
  val bootCount: Int,
  val baselineRaw: Long,
  val lastRaw: Long,
  val steps: Long
)

data class StepCounterUpdate(
  val state: StepCounterState,
  val rolledOverDayKey: String? = null,
  val rolledOverTimezone: String? = null,
  val rolledOverSteps: Long? = null,
  val counterReset: Boolean = false,
  val rebootDetected: Boolean = false,
  val timezoneChanged: Boolean = false
)

object StepCounterNormalizer {
  fun update(
    previous: StepCounterState?,
    rawReading: Long,
    dayKey: String,
    timezone: String,
    bootCount: Int,
    permissionGranted: Boolean
  ): StepCounterUpdate? {
    if (!permissionGranted || rawReading < 0L) return null

    if (previous == null) {
      return StepCounterUpdate(
        state = StepCounterState(dayKey, timezone, bootCount, rawReading, rawReading, 0L)
      )
    }

    val timezoneChanged = previous.timezone != timezone
    val dateChanged = previous.dayKey != dayKey
    if (timezoneChanged && !dateChanged) {
      return StepCounterUpdate(
        state = StepCounterState(
          dayKey,
          timezone,
          bootCount,
          rawReading,
          rawReading,
          max(0L, previous.steps)
        ),
        rebootDetected = previous.bootCount != bootCount,
        timezoneChanged = true
      )
    }
    if (dateChanged) {
      // With the background service subscribed, a same-boot delta observed on
      // the new date belongs to that new date. Keeping it avoids dropping the
      // first walk after midnight. A rebooted counter is deliberately
      // re-baselined because its pre-midnight portion cannot be separated.
      val firstNewDaySteps = if (
        previous.bootCount == bootCount && rawReading >= previous.lastRaw
      ) {
        rawReading - previous.lastRaw
      } else {
        0L
      }
      return StepCounterUpdate(
        state = StepCounterState(
          dayKey,
          timezone,
          bootCount,
          rawReading - firstNewDaySteps,
          rawReading,
          firstNewDaySteps
        ),
        rolledOverDayKey = previous.dayKey,
        rolledOverTimezone = previous.timezone,
        rolledOverSteps = max(0L, previous.steps),
        rebootDetected = previous.bootCount != bootCount,
        timezoneChanged = timezoneChanged
      )
    }

    if (previous.bootCount != bootCount) {
      // The counter restarted at boot. Its current value represents every step
      // since that reboot, including steps taken while Anthra was not running.
      val nextSteps = max(0L, previous.steps) + rawReading
      return StepCounterUpdate(
        state = StepCounterState(dayKey, timezone, bootCount, rawReading, rawReading, nextSteps),
        rebootDetected = true
      )
    }

    if (rawReading < previous.lastRaw) {
      // TYPE_STEP_COUNTER is cumulative for the current boot. A smaller value
      // is therefore a stale, out-of-order callback (for example, an older
      // batched background event arriving after a foreground refresh). Moving
      // lastRaw backwards would count the same steps again on the next event.
      return StepCounterUpdate(
        state = previous,
        counterReset = true
      )
    }

    val delta = rawReading - previous.lastRaw
    return StepCounterUpdate(
      state = previous.copy(
        lastRaw = rawReading,
        steps = max(0L, previous.steps) + delta
      )
    )
  }
}

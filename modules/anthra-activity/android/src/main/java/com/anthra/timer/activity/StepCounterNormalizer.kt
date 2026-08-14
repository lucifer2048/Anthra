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

    if (
      previous.bootCount == bootCount &&
      (
        rawReading < previous.lastRaw ||
          (!timezoneChanged && dayKey < previous.dayKey)
      )
    ) {
      // Reject stale batched callbacks before evaluating their date. Otherwise
      // a late event from yesterday can roll the state backwards into yesterday.
      return StepCounterUpdate(
        state = previous,
        counterReset = true
      )
    }

    if (timezoneChanged && !dateChanged) {
      val delta = if (previous.bootCount == bootCount) {
        rawReading - previous.lastRaw
      } else {
        rawReading
      }
      return StepCounterUpdate(
        state = previous.copy(
          timezone = timezone,
          bootCount = bootCount,
          lastRaw = rawReading,
          steps = max(0L, previous.steps) + max(0L, delta)
        ),
        rebootDetected = previous.bootCount != bootCount,
        timezoneChanged = true
      )
    }
    if (dateChanged) {
      // Events are dated using SensorEvent.timestamp by the manager. With the
      // service continuously subscribed, the first delta observed on a new
      // date belongs to the new date. After a reboot, retaining the new boot's
      // raw count is preferable to silently discarding every post-boot step.
      val firstNewDaySteps = if (previous.bootCount == bootCount) {
        rawReading - previous.lastRaw
      } else {
        rawReading
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

    val delta = rawReading - previous.lastRaw
    return StepCounterUpdate(
      state = previous.copy(
        lastRaw = rawReading,
        steps = max(0L, previous.steps) + delta
      )
    )
  }
}

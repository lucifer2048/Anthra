package com.anthra.timer.activity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StepCounterNormalizerTest {
  @Test
  fun initialReadingCreatesZeroBaseline() {
    val update = StepCounterNormalizer.update(
      previous = null,
      rawReading = 12_345,
      dayKey = "2026-07-26",
      timezone = "Asia/Kolkata",
      bootCount = 8,
      permissionGranted = true
    )!!

    assertEquals(12_345, update.state.baselineRaw)
    assertEquals(0, update.state.steps)
  }

  @Test
  fun sameBootAddsOnlyRawDelta() {
    val previous = state(lastRaw = 2_000, steps = 450)
    val update = StepCounterNormalizer.update(
      previous,
      2_125,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!

    assertEquals(575, update.state.steps)
    assertFalse(update.counterReset)
  }

  @Test
  fun repeatedSensorCallbackAddsNoSteps() {
    val previous = state(lastRaw = 2_000, steps = 450)
    val update = StepCounterNormalizer.update(
      previous,
      2_000,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!

    assertEquals(450, update.state.steps)
    assertEquals(2_000, update.state.lastRaw)
  }

  @Test
  fun eachRawCounterIncrementAddsExactlyOneStep() {
    val previous = state(lastRaw = 2_000, steps = 450)
    val first = StepCounterNormalizer.update(
      previous,
      2_001,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!
    val duplicate = StepCounterNormalizer.update(
      first.state,
      2_001,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!
    val second = StepCounterNormalizer.update(
      duplicate.state,
      2_002,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!

    assertEquals(452, second.state.steps)
  }

  @Test
  fun rebootAddsNewBootCounterToExistingDay() {
    val previous = state(lastRaw = 9_000, steps = 1_300, bootCount = 10)
    val update = StepCounterNormalizer.update(
      previous,
      240,
      previous.dayKey,
      previous.timezone,
      11,
      true
    )!!

    assertTrue(update.rebootDetected)
    assertEquals(1_540, update.state.steps)
  }

  @Test
  fun staleSameBootReadingDoesNotMoveCheckpointBackwards() {
    val previous = state(lastRaw = 9_000, steps = 1_300)
    val update = StepCounterNormalizer.update(
      previous,
      80,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!

    assertTrue(update.counterReset)
    assertEquals(1_300, update.state.steps)
    assertEquals(9_000, update.state.lastRaw)
    assertEquals(1_550, update.state.baselineRaw)
  }

  @Test
  fun staleReadingCannotCauseFollowingReadingToBeCountedTwice() {
    val previous = state(lastRaw = 9_000, steps = 1_300)
    val stale = StepCounterNormalizer.update(
      previous,
      8_950,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!
    val next = StepCounterNormalizer.update(
      stale.state,
      9_025,
      previous.dayKey,
      previous.timezone,
      previous.bootCount,
      true
    )!!

    assertEquals(1_325, next.state.steps)
    assertEquals(9_025, next.state.lastRaw)
  }

  @Test
  fun midnightRollsPreviousDayAndKeepsFirstNewDaySteps() {
    val previous = state(dayKey = "2026-07-25", lastRaw = 7_000, steps = 4_000)
    val update = StepCounterNormalizer.update(
      previous,
      7_020,
      "2026-07-26",
      previous.timezone,
      previous.bootCount,
      true
    )!!

    assertEquals("2026-07-25", update.rolledOverDayKey)
    assertEquals(4_000L, update.rolledOverSteps)
    assertEquals(20, update.state.steps)
    assertEquals(7_000, update.state.baselineRaw)
  }

  @Test
  fun midnightAfterRebootUsesSafeNewBaseline() {
    val previous = state(dayKey = "2026-07-25", lastRaw = 7_000, steps = 4_000, bootCount = 10)
    val update = StepCounterNormalizer.update(
      previous,
      85,
      "2026-07-26",
      previous.timezone,
      11,
      true
    )!!

    assertTrue(update.rebootDetected)
    assertEquals(0, update.state.steps)
    assertEquals(85, update.state.baselineRaw)
  }

  @Test
  fun timezoneChangeCreatesAnUnambiguousNewCheckpoint() {
    val previous = state(timezone = "Asia/Kolkata", lastRaw = 7_000, steps = 4_000)
    val update = StepCounterNormalizer.update(
      previous,
      7_010,
      previous.dayKey,
      "Europe/London",
      previous.bootCount,
      true
    )!!

    assertTrue(update.timezoneChanged)
    assertEquals(4_000, update.state.steps)
    assertNull(update.rolledOverSteps)
  }

  @Test
  fun deniedOrRevokedPermissionDoesNotMutateCheckpoint() {
    val update = StepCounterNormalizer.update(
      state(),
      2_100,
      "2026-07-26",
      "Asia/Kolkata",
      8,
      permissionGranted = false
    )
    assertNull(update)
  }

  private fun state(
    dayKey: String = "2026-07-26",
    timezone: String = "Asia/Kolkata",
    bootCount: Int = 8,
    lastRaw: Long = 2_000,
    steps: Long = 450
  ) = StepCounterState(
    dayKey = dayKey,
    timezone = timezone,
    bootCount = bootCount,
    baselineRaw = 1_550,
    lastRaw = lastRaw,
    steps = steps
  )
}

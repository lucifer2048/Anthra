package com.anthra.timer.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PushupRepCounterTest {
  @Test
  fun countsOnlyAfterStableSideViewTopDownTopCycle() {
    val counter = PushupRepCounter(target = 2)
    var now = 1_000L

    repeat(6) { counter.update(top(), now.also { now += 50 }) }
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)

    repeat(2) { counter.update(bottom(), now.also { now += 100 }) }
    assertEquals(PushupRepCounter.Stage.READY_FOR_UP, counter.stage)

    var result = counter.update(top(), now.also { now += 150 })
    repeat(2) { result = counter.update(top(), now.also { now += 150 }) }
    assertTrue(result.counted)
    assertEquals(1, counter.count)
    assertFalse(result.completed)
  }

  @Test
  fun countsInCompactModeWhenFeetAreOutsideTheFrame() {
    val counter = PushupRepCounter(target = 1)
    var now = 1_000L
    val compactTop = top(
      kneeAngle = Double.NaN,
      fullBodyTracked = false,
      footX = Double.NaN,
      footY = Double.NaN
    )
    val compactBottom = bottom(
      kneeAngle = Double.NaN,
      fullBodyTracked = false,
      footX = Double.NaN,
      footY = Double.NaN
    )

    repeat(6) { counter.update(compactTop, now.also { now += 60 }) }
    repeat(2) { counter.update(compactBottom, now.also { now += 120 }) }
    repeat(3) { counter.update(compactTop, now.also { now += 150 }) }

    assertEquals(1, counter.count)
  }

  @Test
  fun rejectsShallowElbowBend() {
    val counter = calibratedCounter()
    var now = 2_000L
    repeat(10) { counter.update(bottom(elbowAngle = 125.0), now.also { now += 80 }) }
    repeat(6) { counter.update(top(), now.also { now += 80 }) }
    assertEquals(0, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun rejectsElbowBendWithoutEnoughChestTravel() {
    val counter = calibratedCounter()
    var now = 2_000L
    repeat(10) { counter.update(bottom(shoulderClearance = 0.18), now.also { now += 80 }) }
    repeat(6) { counter.update(top(), now.also { now += 80 }) }
    assertEquals(0, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun rejectsRaisedOrSaggingHips() {
    val counter = calibratedCounter()
    var now = 2_000L
    repeat(10) { counter.update(bottom(bodyLineAngle = 135.0), now.also { now += 80 }) }
    assertEquals(0, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun rejectsKneePushupsInFullBodyMode() {
    val counter = calibratedCounter()
    var now = 2_000L
    repeat(10) { counter.update(bottom(kneeAngle = 115.0), now.also { now += 80 }) }
    assertEquals(0, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun rejectsAFrontFacingOrVerticalBodyAxis() {
    val counter = PushupRepCounter(target = 1)
    var now = 1_000L
    repeat(12) { counter.update(top(bodyTilt = 58.0), now.also { now += 60 }) }
    assertEquals(PushupRepCounter.Stage.NEED_START_POSITION, counter.stage)
    assertNull(counter.topShoulderClearance)
  }

  @Test
  fun rejectsMovingThePlantedHand() {
    val counter = calibratedCounter()
    var now = 2_000L
    repeat(10) { counter.update(bottom(wristX = 0.28), now.also { now += 80 }) }
    assertEquals(0, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun rejectsMovingThePlantedFoot() {
    val counter = calibratedCounter()
    var now = 2_000L
    repeat(10) { counter.update(bottom(footX = 0.92), now.also { now += 80 }) }
    assertEquals(0, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun rejectsARepThatDoesNotReturnToFullArmExtension() {
    val counter = calibratedCounter()
    var now = 2_000L
    repeat(2) { counter.update(bottom(), now.also { now += 120 }) }
    repeat(10) { counter.update(top(elbowAngle = 132.0), now.also { now += 100 }) }
    assertEquals(0, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_UP, counter.stage)
  }

  @Test
  fun requiresANewBottomPositionForEveryRep() {
    val counter = calibratedCounter(target = 2)
    var now = 2_000L
    repeat(3) { counter.update(bottom(), now.also { now += 100 }) }
    repeat(4) { counter.update(top(), now.also { now += 100 }) }
    repeat(20) { counter.update(top(), now.also { now += 50 }) }
    assertEquals(1, counter.count)
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun countsAValidRepDespiteBriefLandmarkNoise() {
    val counter = calibratedCounter()
    var now = 2_000L

    counter.update(bottom(), now.also { now += 100 })
    counter.pauseStability()
    counter.update(bottom(), now.also { now += 100 })
    assertEquals(PushupRepCounter.Stage.READY_FOR_UP, counter.stage)

    counter.update(top(), now.also { now += 150 })
    counter.pauseStability()
    repeat(3) { counter.update(top(), now.also { now += 150 }) }

    assertEquals(1, counter.count)
  }

  @Test
  fun resetsSideViewCalibrationAfterTrackingIsLost() {
    val counter = calibratedCounter()
    counter.onTrackingLost(5_000L)
    assertEquals(PushupRepCounter.Stage.NEED_START_POSITION, counter.stage)
    assertNull(counter.topShoulderClearance)
    assertNull(counter.topElbowAngle)
  }

  @Test
  fun requiresConsecutiveVisibleFramesForInitialCalibration() {
    val counter = PushupRepCounter(target = 1)
    var now = 1_000L
    repeat(3) { counter.update(top(), now.also { now += 50 }) }
    counter.pauseStability()
    repeat(3) { counter.update(top(), now.also { now += 50 }) }
    assertEquals(PushupRepCounter.Stage.NEED_START_POSITION, counter.stage)
    repeat(3) { counter.update(top(), now.also { now += 50 }) }
    assertEquals(PushupRepCounter.Stage.READY_FOR_DOWN, counter.stage)
  }

  @Test
  fun requiresAStraightArmBeforeCalibration() {
    val counter = PushupRepCounter(target = 1)
    var now = 1_000L
    repeat(12) { counter.update(top(elbowAngle = 132.0), now.also { now += 60 }) }
    assertEquals(PushupRepCounter.Stage.NEED_START_POSITION, counter.stage)
    assertNull(counter.topElbowAngle)
  }

  private fun calibratedCounter(target: Int = 1): PushupRepCounter {
    val counter = PushupRepCounter(target)
    var now = 1_000L
    repeat(6) { counter.update(top(), now.also { now += 50 }) }
    return counter
  }

  private fun top(
    elbowAngle: Double = 165.0,
    shoulderClearance: Double = 0.22,
    bodyLineAngle: Double = 175.0,
    kneeAngle: Double = 178.0,
    bodyTilt: Double = 6.0,
    wristX: Double = 0.20,
    wristY: Double = 0.72,
    fullBodyTracked: Boolean = true,
    footX: Double = 0.82,
    footY: Double = 0.75
  ) = PushupRepCounter.Sample(
    elbowAngle = elbowAngle,
    shoulderClearance = shoulderClearance,
    bodyLineAngle = bodyLineAngle,
    kneeAngle = kneeAngle,
    bodyTilt = bodyTilt,
    wristX = wristX,
    wristY = wristY,
    fullBodyTracked = fullBodyTracked,
    footX = footX,
    footY = footY
  )

  private fun bottom(
    elbowAngle: Double = 92.0,
    shoulderClearance: Double = 0.12,
    bodyLineAngle: Double = 172.0,
    kneeAngle: Double = 176.0,
    bodyTilt: Double = 7.0,
    wristX: Double = 0.20,
    wristY: Double = 0.72,
    fullBodyTracked: Boolean = true,
    footX: Double = 0.82,
    footY: Double = 0.75
  ) = PushupRepCounter.Sample(
    elbowAngle = elbowAngle,
    shoulderClearance = shoulderClearance,
    bodyLineAngle = bodyLineAngle,
    kneeAngle = kneeAngle,
    bodyTilt = bodyTilt,
    wristX = wristX,
    wristY = wristY,
    fullBodyTracked = fullBodyTracked,
    footX = footX,
    footY = footY
  )
}

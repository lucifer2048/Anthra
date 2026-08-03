package com.anthra.timer.alarm

import kotlin.math.hypot

/**
 * Deterministic side-view push-up state machine. Pose detection supplies the
 * camera-facing arm and head-to-knee geometry. A repetition requires a stable
 * straight-body top, planted hand, verified elbow/shoulder depth, and a return
 * to the calibrated top position. Lower-leg checks are added when visible.
 */
class PushupRepCounter(private val target: Int) {
  enum class Stage { NEED_START_POSITION, READY_FOR_DOWN, READY_FOR_UP }

  data class Sample(
    val elbowAngle: Double,
    val shoulderClearance: Double,
    val bodyLineAngle: Double,
    val kneeAngle: Double,
    val bodyTilt: Double,
    val wristX: Double,
    val wristY: Double,
    val fullBodyTracked: Boolean,
    val footX: Double,
    val footY: Double
  )

  data class Update(
    val count: Int,
    val title: String,
    val detail: String,
    val counted: Boolean = false,
    val completed: Boolean = false
  )

  var stage: Stage = Stage.NEED_START_POSITION
    private set
  var count: Int = 0
    private set
  var topShoulderClearance: Double? = null
    private set
  var topElbowAngle: Double? = null
    private set

  private var stableStartFrames = 0
  private var stableUpFrames = 0
  private var stableDownFrames = 0
  private var startClearanceTotal = 0.0
  private var startElbowTotal = 0.0
  private var startWristXTotal = 0.0
  private var startWristYTotal = 0.0
  private var startFootXTotal = 0.0
  private var startFootYTotal = 0.0
  private var startFootFrames = 0
  private var plantedWristX: Double? = null
  private var plantedWristY: Double? = null
  private var plantedFootX: Double? = null
  private var plantedFootY: Double? = null
  private var downReachedAt = 0L
  private var lastRepAt = 0L
  private var lastValidPoseAt = 0L
  private var interruptedFrames = 0

  fun update(sample: Sample, now: Long): Update {
    if (!sample.isFiniteAndUsable()) {
      pauseStability()
      return Update(count, "Fit head through knees on screen", "Feet may stay outside the frame in compact mode.")
    }

    lastValidPoseAt = now
    formIssue(sample)?.let { issue ->
      pauseStability()
      return issue
    }

    if (stage != Stage.NEED_START_POSITION && wristDrift(sample) > MAX_WRIST_DRIFT) {
      pauseStability()
      return Update(count, "Keep your hand planted", "Return your camera-side hand to its calibrated position.")
    }
    if (stage != Stage.NEED_START_POSITION && sample.fullBodyTracked && footDrift(sample) > MAX_FOOT_DRIFT) {
      pauseStability()
      return Update(count, "Keep your feet planted", "Return your camera-side foot to its calibrated position.")
    }

    interruptedFrames = 0
    return when (stage) {
      Stage.NEED_START_POSITION -> verifyStart(sample)
      Stage.READY_FOR_DOWN -> verifyDown(sample, now)
      Stage.READY_FOR_UP -> verifyUp(sample, now)
    }
  }

  fun onTrackingLost(now: Long) {
    if (lastValidPoseAt == 0L || now - lastValidPoseAt <= TRACKING_RESET_MS) return
    stage = Stage.NEED_START_POSITION
    stableUpFrames = 0
    stableDownFrames = 0
    topShoulderClearance = null
    topElbowAngle = null
    plantedWristX = null
    plantedWristY = null
    plantedFootX = null
    plantedFootY = null
    downReachedAt = 0L
    interruptedFrames = 0
    resetStartCalibration()
  }

  fun pauseStability() {
    if (stage == Stage.NEED_START_POSITION) {
      resetStartCalibration()
      return
    }

    // Tolerate a couple of poor ML frames without erasing a real hold.
    interruptedFrames += 1
    if (interruptedFrames <= MAX_INTERRUPTED_FRAMES) return
    stableUpFrames = 0
    stableDownFrames = 0
  }

  fun currentGuidance(): String = when (stage) {
    Stage.NEED_START_POSITION -> "Hold a straight-arm plank side-on"
    Stage.READY_FOR_DOWN -> "Bend your elbow and lower your chest"
    Stage.READY_FOR_UP -> "Press back to full extension"
  }

  fun motionTargetGuidance(): String = when (stage) {
    Stage.NEED_START_POSITION -> "hold the straight-arm top position"
    Stage.READY_FOR_DOWN -> "elbow ≤110° and chest lower"
    Stage.READY_FOR_UP -> "straighten the arm and return to the top"
  }

  private fun formIssue(sample: Sample): Update? = when {
    sample.bodyTilt > MAX_BODY_TILT -> Update(
      count,
      "Turn fully sideways",
      "Keep shoulders-to-knees running across the landscape frame."
    )
    sample.bodyLineAngle < MIN_BODY_LINE_ANGLE -> Update(
      count,
      "Keep shoulders, hips, and knees aligned",
      "Lower as one straight line without lifting or dropping your hips."
    )
    sample.fullBodyTracked && sample.kneeAngle < MIN_KNEE_ANGLE -> Update(
      count,
      "Straighten both legs",
      "Knee push-ups do not count when the lower leg is visible."
    )
    else -> null
  }

  private fun verifyStart(sample: Sample): Update {
    if (sample.elbowAngle < MIN_START_ELBOW_ANGLE) {
      resetStartCalibration()
      return Update(count, "Straighten your camera-side arm", "Hold full extension to calibrate the top position.")
    }

    stableStartFrames += 1
    startClearanceTotal += sample.shoulderClearance
    startElbowTotal += sample.elbowAngle
    startWristXTotal += sample.wristX
    startWristYTotal += sample.wristY
    if (sample.fullBodyTracked) {
      startFootXTotal += sample.footX
      startFootYTotal += sample.footY
      startFootFrames += 1
    }
    if (stableStartFrames < REQUIRED_START_FRAMES) {
      return Update(count, "Hold the top position", "Calibrating your arm height, hand, and foot positions…")
    }

    topShoulderClearance = startClearanceTotal / stableStartFrames
    topElbowAngle = startElbowTotal / stableStartFrames
    plantedWristX = startWristXTotal / stableStartFrames
    plantedWristY = startWristYTotal / stableStartFrames
    if (startFootFrames >= REQUIRED_FOOT_CALIBRATION_FRAMES) {
      plantedFootX = startFootXTotal / startFootFrames
      plantedFootY = startFootYTotal / startFootFrames
    } else {
      plantedFootX = null
      plantedFootY = null
    }
    resetStartCalibration()
    stage = Stage.READY_FOR_DOWN
    return Update(count, "Ready — lower with control", "Keep your whole body straight while bending the camera-side elbow.")
  }

  private fun verifyDown(sample: Sample, now: Long): Update {
    val topClearance = topShoulderClearance ?: return resetAndRequestCalibration()
    if (sample.elbowAngle > MAX_BOTTOM_ELBOW_ANGLE) {
      stableDownFrames = (stableDownFrames - 1).coerceAtLeast(0)
      return Update(count, "Bend your elbow farther", "Reach 110° or less on the camera-side elbow.")
    }
    if (sample.shoulderClearance > topClearance * MAX_BOTTOM_CLEARANCE_RATIO) {
      stableDownFrames = (stableDownFrames - 1).coerceAtLeast(0)
      return Update(count, "Lower your chest farther", "Bring your shoulder closer to the planted-hand level.")
    }

    stableDownFrames += 1
    if (stableDownFrames < REQUIRED_DOWN_FRAMES) {
      return Update(count, "Hold that depth", "Confirming elbow depth and chest travel…")
    }
    stableDownFrames = 0
    stage = Stage.READY_FOR_UP
    downReachedAt = now
    return Update(count, "Good depth — press up", "Keep your body straight and return to full arm extension.")
  }

  private fun verifyUp(sample: Sample, now: Long): Update {
    val topClearance = topShoulderClearance ?: return resetAndRequestCalibration()
    val calibratedElbow = topElbowAngle ?: return resetAndRequestCalibration()
    val returnElbowTarget = maxOf(MIN_RETURN_ELBOW_ANGLE, calibratedElbow - MAX_RETURN_ANGLE_SHORTFALL)
    if (sample.elbowAngle < returnElbowTarget) {
      stableUpFrames = (stableUpFrames - 1).coerceAtLeast(0)
      return Update(count, "Straighten your arm fully", "Return the camera-side elbow to at least ${returnElbowTarget.toInt()}°.")
    }
    if (sample.shoulderClearance < topClearance * MIN_RETURN_CLEARANCE_RATIO) {
      stableUpFrames = (stableUpFrames - 1).coerceAtLeast(0)
      return Update(count, "Press up to the top", "Raise your shoulder to the calibrated starting height.")
    }

    stableUpFrames += 1
    val enoughMovementTime = now - downReachedAt >= MIN_DOWN_TO_UP_MS && now - lastRepAt >= MIN_REP_INTERVAL_MS
    if (stableUpFrames < REQUIRED_UP_FRAMES || !enoughMovementTime) {
      return Update(count, "Hold full extension", "Confirming the straight-arm top position…")
    }

    count += 1
    lastRepAt = now
    stableUpFrames = 0
    stage = Stage.READY_FOR_DOWN
    topShoulderClearance = topClearance * 0.8 + sample.shoulderClearance * 0.2
    topElbowAngle = calibratedElbow * 0.8 + sample.elbowAngle * 0.2
    return Update(
      count = count,
      title = if (count >= target) "Target complete" else "Rep $count counted",
      detail = if (count >= target) {
        "Every rep included verified side-view depth, body alignment, and a planted hand."
      } else {
        "Reset at the top, then lower again when ready."
      },
      counted = true,
      completed = count >= target
    )
  }

  private fun resetAndRequestCalibration(): Update {
    stage = Stage.NEED_START_POSITION
    resetStartCalibration()
    return Update(count, "Recalibrate the top position", "Hold a straight-arm plank side-on to the camera.")
  }

  private fun resetStartCalibration() {
    stableStartFrames = 0
    startClearanceTotal = 0.0
    startElbowTotal = 0.0
    startWristXTotal = 0.0
    startWristYTotal = 0.0
    startFootXTotal = 0.0
    startFootYTotal = 0.0
    startFootFrames = 0
  }

  private fun wristDrift(sample: Sample): Double {
    val x = plantedWristX ?: return 0.0
    val y = plantedWristY ?: return 0.0
    return hypot(sample.wristX - x, sample.wristY - y)
  }

  private fun footDrift(sample: Sample): Double {
    val x = plantedFootX ?: return 0.0
    val y = plantedFootY ?: return 0.0
    return hypot(sample.footX - x, sample.footY - y)
  }

  private fun Sample.isFiniteAndUsable(): Boolean =
    elbowAngle.isFinite() && shoulderClearance.isFinite() && shoulderClearance > 0.01 &&
      bodyLineAngle.isFinite() && bodyTilt.isFinite() && wristX.isFinite() && wristY.isFinite() &&
      (!fullBodyTracked || (kneeAngle.isFinite() && footX.isFinite() && footY.isFinite()))

  companion object {
    const val MIN_START_ELBOW_ANGLE = 145.0
    const val MAX_BOTTOM_ELBOW_ANGLE = 110.0
    const val MIN_RETURN_ELBOW_ANGLE = 145.0
    const val MAX_RETURN_ANGLE_SHORTFALL = 12.0
    const val MIN_BODY_LINE_ANGLE = 150.0
    const val MIN_KNEE_ANGLE = 155.0
    const val MAX_BODY_TILT = 35.0
    const val MAX_BOTTOM_CLEARANCE_RATIO = 0.75
    const val MIN_RETURN_CLEARANCE_RATIO = 0.82
    const val MAX_WRIST_DRIFT = 0.06
    const val MAX_FOOT_DRIFT = 0.08
    const val REQUIRED_START_FRAMES = 6
    const val REQUIRED_FOOT_CALIBRATION_FRAMES = 4
    const val REQUIRED_UP_FRAMES = 3
    const val REQUIRED_DOWN_FRAMES = 2
    const val MAX_INTERRUPTED_FRAMES = 2
    const val MIN_DOWN_TO_UP_MS = 300L
    const val MIN_REP_INTERVAL_MS = 650L
    const val TRACKING_RESET_MS = 1_500L
  }
}

import Foundation

final class PushupRepCounter {
  enum Stage {
    case needStartPosition
    case readyForDown
    case readyForUp
  }

  struct Sample {
    let elbowAngle: Double
    let shoulderClearance: Double
    let bodyLineAngle: Double
    let kneeAngle: Double
    let bodyTilt: Double
    let wristX: Double
    let wristY: Double
    let fullBodyTracked: Bool
    let footX: Double
    let footY: Double
  }

  struct Update {
    let count: Int
    let title: String
    let detail: String
    let counted: Bool
    let completed: Bool
  }

  private(set) var stage: Stage = .needStartPosition
  private(set) var count = 0
  private let target: Int

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
  private var topShoulderClearance: Double?
  private var topElbowAngle: Double?
  private var plantedWristX: Double?
  private var plantedWristY: Double?
  private var plantedFootX: Double?
  private var plantedFootY: Double?
  private var downReachedAt: Int64 = 0
  private var lastRepAt: Int64 = 0
  private var lastValidPoseAt: Int64 = 0
  private var interruptedFrames = 0

  init(target: Int) {
    self.target = target
  }

  func update(sample: Sample, now: Int64) -> Update {
    guard sample.isFiniteAndUsable else {
      pauseStability()
      return Update(
        count: count,
        title: "Fit head through knees on screen",
        detail: "Feet may stay outside the frame in compact mode.",
        counted: false,
        completed: false
      )
    }

    lastValidPoseAt = now
    if let issue = formIssue(sample: sample) {
      pauseStability()
      return issue
    }

    if stage != .needStartPosition && wristDrift(sample: sample) > Self.maxWristDrift {
      pauseStability()
      return Update(
        count: count,
        title: "Keep your hand planted",
        detail: "Return your camera-side hand to its calibrated position.",
        counted: false,
        completed: false
      )
    }
    if stage != .needStartPosition && sample.fullBodyTracked && footDrift(sample: sample) > Self.maxFootDrift {
      pauseStability()
      return Update(
        count: count,
        title: "Keep your feet planted",
        detail: "Return your camera-side foot to its calibrated position.",
        counted: false,
        completed: false
      )
    }

    interruptedFrames = 0
    switch stage {
    case .needStartPosition:
      return verifyStart(sample: sample)
    case .readyForDown:
      return verifyDown(sample: sample, now: now)
    case .readyForUp:
      return verifyUp(sample: sample, now: now)
    }
  }

  func onTrackingLost(now: Int64) {
    if lastValidPoseAt == 0 || now - lastValidPoseAt <= Self.trackingResetMs { return }
    stage = .needStartPosition
    stableUpFrames = 0
    stableDownFrames = 0
    topShoulderClearance = nil
    topElbowAngle = nil
    plantedWristX = nil
    plantedWristY = nil
    plantedFootX = nil
    plantedFootY = nil
    downReachedAt = 0
    interruptedFrames = 0
    resetStartCalibration()
  }

  func pauseStability() {
    if stage == .needStartPosition {
      resetStartCalibration()
      return
    }
    interruptedFrames += 1
    if interruptedFrames <= Self.maxInterruptedFrames { return }
    stableUpFrames = 0
    stableDownFrames = 0
  }

  private func formIssue(sample: Sample) -> Update? {
    if sample.bodyTilt > Self.maxBodyTilt {
      return Update(
        count: count,
        title: "Turn fully sideways",
        detail: "Keep shoulders-to-knees running across the landscape frame.",
        counted: false,
        completed: false
      )
    }
    if sample.bodyLineAngle < Self.minBodyLineAngle {
      return Update(
        count: count,
        title: "Keep shoulders, hips, and knees aligned",
        detail: "Lower as one straight line without lifting or dropping your hips.",
        counted: false,
        completed: false
      )
    }
    if sample.fullBodyTracked && sample.kneeAngle < Self.minKneeAngle {
      return Update(
        count: count,
        title: "Straighten both legs",
        detail: "Knee push-ups do not count when the lower leg is visible.",
        counted: false,
        completed: false
      )
    }
    return nil
  }

  private func verifyStart(sample: Sample) -> Update {
    if sample.elbowAngle < Self.minStartElbowAngle {
      resetStartCalibration()
      return Update(
        count: count,
        title: "Straighten your camera-side arm",
        detail: "Hold full extension to calibrate the top position.",
        counted: false,
        completed: false
      )
    }

    stableStartFrames += 1
    startClearanceTotal += sample.shoulderClearance
    startElbowTotal += sample.elbowAngle
    startWristXTotal += sample.wristX
    startWristYTotal += sample.wristY
    if sample.fullBodyTracked {
      startFootXTotal += sample.footX
      startFootYTotal += sample.footY
      startFootFrames += 1
    }
    if stableStartFrames < Self.requiredStartFrames {
      return Update(
        count: count,
        title: "Hold the top position",
        detail: "Calibrating your arm height, hand, and foot positions…",
        counted: false,
        completed: false
      )
    }

    topShoulderClearance = startClearanceTotal / Double(stableStartFrames)
    topElbowAngle = startElbowTotal / Double(stableStartFrames)
    plantedWristX = startWristXTotal / Double(stableStartFrames)
    plantedWristY = startWristYTotal / Double(stableStartFrames)
    if startFootFrames >= Self.requiredFootCalibrationFrames {
      plantedFootX = startFootXTotal / Double(startFootFrames)
      plantedFootY = startFootYTotal / Double(startFootFrames)
    } else {
      plantedFootX = nil
      plantedFootY = nil
    }
    resetStartCalibration()
    stage = .readyForDown
    return Update(
      count: count,
      title: "Ready — lower with control",
      detail: "Keep your whole body straight while bending the camera-side elbow.",
      counted: false,
      completed: false
    )
  }

  private func verifyDown(sample: Sample, now: Int64) -> Update {
    guard let topClearance = topShoulderClearance else {
      return resetAndRequestCalibration()
    }
    if sample.elbowAngle > Self.maxBottomElbowAngle {
      stableDownFrames = max(0, stableDownFrames - 1)
      return Update(
        count: count,
        title: "Bend your elbow farther",
        detail: "Reach 110° or less on the camera-side elbow.",
        counted: false,
        completed: false
      )
    }
    if sample.shoulderClearance > topClearance * Self.maxBottomClearanceRatio {
      stableDownFrames = max(0, stableDownFrames - 1)
      return Update(
        count: count,
        title: "Lower your chest farther",
        detail: "Bring your shoulder closer to the planted-hand level.",
        counted: false,
        completed: false
      )
    }

    stableDownFrames += 1
    if stableDownFrames < Self.requiredDownFrames {
      return Update(
        count: count,
        title: "Hold that depth",
        detail: "Confirming elbow depth and chest travel…",
        counted: false,
        completed: false
      )
    }
    stableDownFrames = 0
    stage = .readyForUp
    downReachedAt = now
    return Update(
      count: count,
      title: "Good depth — press up",
      detail: "Keep your body straight and return to full arm extension.",
      counted: false,
      completed: false
    )
  }

  private func verifyUp(sample: Sample, now: Int64) -> Update {
    guard let topClearance = topShoulderClearance,
          let calibratedElbow = topElbowAngle else {
      return resetAndRequestCalibration()
    }
    let returnElbowTarget = max(Self.minReturnElbowAngle, calibratedElbow - Self.maxReturnAngleShortfall)
    if sample.elbowAngle < returnElbowTarget {
      stableUpFrames = max(0, stableUpFrames - 1)
      return Update(
        count: count,
        title: "Straighten your arm fully",
        detail: "Return the camera-side elbow to at least \(Int(returnElbowTarget))°.",
        counted: false,
        completed: false
      )
    }
    if sample.shoulderClearance < topClearance * Self.minReturnClearanceRatio {
      stableUpFrames = max(0, stableUpFrames - 1)
      return Update(
        count: count,
        title: "Press up to the top",
        detail: "Raise your shoulder to the calibrated starting height.",
        counted: false,
        completed: false
      )
    }

    stableUpFrames += 1
    let enoughMovementTime = now - downReachedAt >= Self.minDownToUpMs && now - lastRepAt >= Self.minRepIntervalMs
    if stableUpFrames < Self.requiredUpFrames || !enoughMovementTime {
      return Update(
        count: count,
        title: "Hold full extension",
        detail: "Confirming the straight-arm top position…",
        counted: false,
        completed: false
      )
    }

    count += 1
    lastRepAt = now
    stableUpFrames = 0
    stage = .readyForDown
    topShoulderClearance = topClearance * 0.8 + sample.shoulderClearance * 0.2
    topElbowAngle = calibratedElbow * 0.8 + sample.elbowAngle * 0.2
    let completed = count >= target
    return Update(
      count: count,
      title: completed ? "Target complete" : "Rep \(count) counted",
      detail: completed
        ? "Every rep included verified side-view depth, body alignment, and a planted hand."
        : "Reset at the top, then lower again when ready.",
      counted: true,
      completed: completed
    )
  }

  private func resetAndRequestCalibration() -> Update {
    stage = .needStartPosition
    resetStartCalibration()
    return Update(
      count: count,
      title: "Recalibrate the top position",
      detail: "Hold a straight-arm plank side-on to the camera.",
      counted: false,
      completed: false
    )
  }

  private func resetStartCalibration() {
    stableStartFrames = 0
    startClearanceTotal = 0
    startElbowTotal = 0
    startWristXTotal = 0
    startWristYTotal = 0
    startFootXTotal = 0
    startFootYTotal = 0
    startFootFrames = 0
  }

  private func wristDrift(sample: Sample) -> Double {
    guard let x = plantedWristX, let y = plantedWristY else { return 0 }
    return hypot(sample.wristX - x, sample.wristY - y)
  }

  private func footDrift(sample: Sample) -> Double {
    guard let x = plantedFootX, let y = plantedFootY else { return 0 }
    return hypot(sample.footX - x, sample.footY - y)
  }

  private static let minStartElbowAngle = 145.0
  private static let maxBottomElbowAngle = 110.0
  private static let minReturnElbowAngle = 145.0
  private static let maxReturnAngleShortfall = 12.0
  private static let minBodyLineAngle = 150.0
  private static let minKneeAngle = 155.0
  private static let maxBodyTilt = 35.0
  private static let maxBottomClearanceRatio = 0.75
  private static let minReturnClearanceRatio = 0.82
  private static let maxWristDrift = 0.06
  private static let maxFootDrift = 0.08
  private static let requiredStartFrames = 6
  private static let requiredFootCalibrationFrames = 4
  private static let requiredUpFrames = 3
  private static let requiredDownFrames = 2
  private static let maxInterruptedFrames = 2
  private static let minDownToUpMs: Int64 = 300
  private static let minRepIntervalMs: Int64 = 650
  private static let trackingResetMs: Int64 = 1_500
}

private extension PushupRepCounter.Sample {
  func isFiniteAndUsable() -> Bool {
    elbowAngle.isFinite && shoulderClearance.isFinite && shoulderClearance > 0.01
      && bodyLineAngle.isFinite && bodyTilt.isFinite && wristX.isFinite && wristY.isFinite
      && (!fullBodyTracked || (kneeAngle.isFinite && footX.isFinite && footY.isFinite))
  }
}

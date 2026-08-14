import AVFoundation
import UIKit
import Vision

final class AlarmChallengePresenter {
  static let shared = AlarmChallengePresenter()
  private var isPresenting = false

  func presentTestChallenge(target: Int) {
    let config = AlarmConfig(
      id: -1,
      label: "Push-up tracking test",
      hour: 0,
      minute: 0,
      days: [0, 1, 2, 3, 4, 5, 6],
      pushupTarget: target,
      soundUri: "",
      soundName: "",
      enabled: false,
      requiresPushups: true
    )
    present(config: config, testMode: true, firedAt: Int64(Date().timeIntervalSince1970 * 1000))
  }

  func presentAlarm(alarmId: Int, firedAt: Int64) {
    guard let config = AlarmStore.get(alarmId) else { return }
    present(config: config, testMode: false, firedAt: firedAt)
  }

  private func present(config: AlarmConfig, testMode: Bool, firedAt: Int64) {
    DispatchQueue.main.async {
      guard !self.isPresenting else { return }
      guard let root = Self.topViewController() else { return }
      if root.presentedViewController is AlarmChallengeViewController { return }
      let controller = AlarmChallengeViewController(config: config, testMode: testMode, firedAt: firedAt)
      controller.modalPresentationStyle = .fullScreen
      self.isPresenting = true
      root.present(controller, animated: true) {
        self.isPresenting = false
      }
    }
  }

  private static func topViewController(base: UIViewController? = UIApplication.shared.connectedScenes
    .compactMap { $0 as? UIWindowScene }
    .flatMap { $0.windows }
    .first { $0.isKeyWindow }?.rootViewController) -> UIViewController? {
    if let nav = base as? UINavigationController {
      return topViewController(base: nav.visibleViewController)
    }
    if let tab = base as? UITabBarController, let selected = tab.selectedViewController {
      return topViewController(base: selected)
    }
    if let presented = base?.presentedViewController {
      return topViewController(base: presented)
    }
    return base
  }
}

final class AlarmChallengeViewController: UIViewController, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let config: AlarmConfig
  private let testMode: Bool
  private let firedAt: Int64
  private var repCounter: PushupRepCounter
  private var completed = false

  private let session = AVCaptureSession()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let visionQueue = DispatchQueue(label: "anthra.alarm.vision")
  private let bodyPoseRequest = VNDetectHumanBodyPoseRequest()
  private var useFrontCamera = true
  private var preferredSide: BodySide?
  private var lastSidePoseAt: Int64 = 0
  private var isProcessing = false

  private let previewView = UIView()
  private let countLabel = UILabel()
  private let guidanceLabel = UILabel()
  private let detailLabel = UILabel()
  private let emergencyButton = UIButton(type: .system)
  private let flipButton = UIButton(type: .system)

  private enum BodySide {
    case left
    case right
  }

  init(config: AlarmConfig, testMode: Bool, firedAt: Int64) {
    self.config = config
    self.testMode = testMode
    self.firedAt = firedAt
    self.repCounter = PushupRepCounter(target: config.pushupTarget)
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    nil
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    isModalInPresentation = true
    buildLayout()
    checkCameraAndStart()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    session.stopRunning()
  }

  override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    .landscape
  }

  override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
    .landscapeRight
  }

  private func buildLayout() {
    previewView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(previewView)

    let overlay = UIStackView()
    overlay.axis = .vertical
    overlay.spacing = 8
    overlay.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(overlay)

    countLabel.font = .systemFont(ofSize: 44, weight: .bold)
    countLabel.textColor = .white
    countLabel.text = "0 / \(config.pushupTarget)"

    guidanceLabel.font = .systemFont(ofSize: 20, weight: .semibold)
    guidanceLabel.textColor = .white
    guidanceLabel.numberOfLines = 0
    guidanceLabel.text = "Hold a straight-arm plank side-on"

    detailLabel.font = .systemFont(ofSize: 15)
    detailLabel.textColor = UIColor(white: 0.85, alpha: 1)
    detailLabel.numberOfLines = 0
    detailLabel.text = "Camera frames stay on-device and are never saved."

    emergencyButton.setTitle("Emergency stop", for: .normal)
    emergencyButton.tintColor = .systemRed
    emergencyButton.addTarget(self, action: #selector(emergencyStop), for: .touchUpInside)

    flipButton.setTitle("Flip camera", for: .normal)
    flipButton.tintColor = .white
    flipButton.addTarget(self, action: #selector(flipCamera), for: .touchUpInside)

    overlay.addArrangedSubview(countLabel)
    overlay.addArrangedSubview(guidanceLabel)
    overlay.addArrangedSubview(detailLabel)
    overlay.addArrangedSubview(flipButton)
    overlay.addArrangedSubview(emergencyButton)

    NSLayoutConstraint.activate([
      previewView.topAnchor.constraint(equalTo: view.topAnchor),
      previewView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      previewView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      previewView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      overlay.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      overlay.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      overlay.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16)
    ])
  }

  private func checkCameraAndStart() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      startCamera()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          if granted {
            self.startCamera()
          } else {
            self.guidanceLabel.text = "Camera permission is required"
            self.detailLabel.text = "Open Settings and allow Camera, then return to Anthra."
          }
        }
      }
    default:
      guidanceLabel.text = "Camera permission is required"
      detailLabel.text = "Open Settings and allow Camera, then return to Anthra."
    }
  }

  private func startCamera() {
    session.beginConfiguration()
    session.sessionPreset = .vga640x480
    session.inputs.forEach { session.removeInput($0) }
    session.outputs.forEach { session.removeOutput($0) }

    let position: AVCaptureDevice.Position = useFrontCamera ? .front : .back
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
          let input = try? AVCaptureDeviceInput(device: device),
          session.canAddInput(input) else {
      guidanceLabel.text = "Camera unavailable"
      return
    }
    session.addInput(input)

    videoOutput.setSampleBufferDelegate(self, queue: visionQueue)
    videoOutput.alwaysDiscardsLateVideoFrames = true
    if session.canAddOutput(videoOutput) {
      session.addOutput(videoOutput)
    }
    session.commitConfiguration()

    let previewLayer = AVCaptureVideoPreviewLayer(session: session)
    previewLayer.videoGravity = .resizeAspectFill
    previewLayer.frame = previewView.bounds
    previewView.layer.sublayers?.forEach { $0.removeFromSuperlayer() }
    previewView.layer.addSublayer(previewLayer)

    DispatchQueue.global(qos: .userInitiated).async {
      self.session.startRunning()
    }
  }

  @objc private func flipCamera() {
    useFrontCamera.toggle()
    preferredSide = nil
    startCamera()
  }

  @objc private func emergencyStop() {
    guard !completed else { return }
    completed = true
    if !testMode && config.id > 0 {
      AlarmStore.addCompletion(
        config: config,
        firedAt: firedAt,
        completedReps: repCounter.count,
        status: "emergency_stopped"
      )
    }
    dismiss(animated: true)
  }

  private func finishSuccess() {
    guard !completed else { return }
    completed = true
    if !testMode && config.id > 0 {
      AlarmStore.addCompletion(
        config: config,
        firedAt: firedAt,
        completedReps: repCounter.count,
        status: "completed"
      )
    }
    dismiss(animated: true)
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard !completed, !isProcessing else { return }
    isProcessing = true
    defer { isProcessing = false }

    let handler = VNImageRequestHandler(cmSampleBuffer: sampleBuffer, orientation: .up, options: [:])
    do {
      try handler.perform([bodyPoseRequest])
      guard let observation = bodyPoseRequest.results?.first as? VNHumanBodyPoseObservation else {
        repCounter.onTrackingLost(now: nowMillis())
        return
      }
      guard let sample = buildSample(from: observation) else {
        repCounter.onTrackingLost(now: nowMillis())
        return
      }
      let update = repCounter.update(sample: sample, now: nowMillis())
      DispatchQueue.main.async {
        self.countLabel.text = "\(update.count) / \(self.config.pushupTarget)"
        self.guidanceLabel.text = update.title
        self.detailLabel.text = update.detail
        if update.completed {
          self.finishSuccess()
        }
      }
    } catch {
      repCounter.onTrackingLost(now: nowMillis())
    }
  }

  private func nowMillis() -> Int64 {
    Int64(Date().timeIntervalSince1970 * 1000)
  }

  private func buildSample(from observation: VNHumanBodyPoseObservation) -> PushupRepCounter.Sample? {
    guard let sidePose = selectSidePose(from: observation) else { return nil }
    let shoulder = sidePose.shoulder
    let elbow = sidePose.elbow
    let wrist = sidePose.wrist
    let hip = sidePose.hip
    let knee = sidePose.knee

    let shoulderPoint = PoseGeometry.Point2(x: shoulder.location.x, y: 1.0 - shoulder.location.y)
    let elbowPoint = PoseGeometry.Point2(x: elbow.location.x, y: 1.0 - elbow.location.y)
    let wristPoint = PoseGeometry.Point2(x: wrist.location.x, y: 1.0 - wrist.location.y)
    let hipPoint = PoseGeometry.Point2(x: hip.location.x, y: 1.0 - hip.location.y)
    let kneePoint = PoseGeometry.Point2(x: knee.location.x, y: 1.0 - knee.location.y)

    let elbowAngle = PoseGeometry.angle2D(first: shoulderPoint, vertex: elbowPoint, last: wristPoint)
    let kneeAngle = PoseGeometry.angle2D(first: hipPoint, vertex: kneePoint, last: sidePose.ankle.map {
      PoseGeometry.Point2(x: $0.location.x, y: 1.0 - $0.location.y)
    } ?? kneePoint)
    let bodyLineAngle = PoseGeometry.angle2D(first: shoulderPoint, vertex: hipPoint, last: kneePoint)
    let bodyTilt = PoseGeometry.angleFromHorizontal(first: shoulderPoint, last: kneePoint)
    let shoulderClearance = PoseGeometry.normalizedPerpendicularDistance(
      point: shoulderPoint,
      axisStart: wristPoint,
      axisEnd: PoseGeometry.Point2(x: (wristPoint.x + hipPoint.x) / 2, y: (wristPoint.y + hipPoint.y) / 2)
    )

    let fullBodyTracked = sidePose.ankle != nil
    let footPoint = sidePose.ankle.map { PoseGeometry.Point2(x: $0.location.x, y: 1.0 - $0.location.y) }
      ?? PoseGeometry.Point2(x: 0, y: 0)

    return PushupRepCounter.Sample(
      elbowAngle: elbowAngle,
      shoulderClearance: shoulderClearance,
      bodyLineAngle: bodyLineAngle,
      kneeAngle: kneeAngle,
      bodyTilt: bodyTilt,
      wristX: wristPoint.x,
      wristY: wristPoint.y,
      fullBodyTracked: fullBodyTracked,
      footX: footPoint.x,
      footY: footPoint.y
    )
  }

  private struct SidePose {
    let side: BodySide
    let shoulder: VNRecognizedPoint
    let elbow: VNRecognizedPoint
    let wrist: VNRecognizedPoint
    let hip: VNRecognizedPoint
    let knee: VNRecognizedPoint
    let ankle: VNRecognizedPoint?
  }

  private func selectSidePose(from observation: VNHumanBodyPoseObservation) -> SidePose? {
    let sides: [(BodySide, [VNHumanBodyPoseObservation.JointName])] = [
      (.left, [.leftShoulder, .leftElbow, .leftWrist, .leftHip, .leftKnee, .leftAnkle]),
      (.right, [.rightShoulder, .rightElbow, .rightWrist, .rightHip, .rightKnee, .rightAnkle])
    ]

    var best: SidePose?
    var bestScore = 0.0
    for (side, joints) in sides {
      var score = 0.0
      var mapped: [VNHumanBodyPoseObservation.JointName: VNRecognizedPoint] = [:]
      for joint in joints {
        guard let point = try? observation.recognizedPoint(joint), point.confidence > 0.2 else { continue }
        mapped[joint] = point
        score += Double(point.confidence)
      }
      guard
        let shoulder = mapped[side == .left ? .leftShoulder : .rightShoulder],
        let elbow = mapped[side == .left ? .leftElbow : .rightElbow],
        let wrist = mapped[side == .left ? .leftWrist : .rightWrist],
        let hip = mapped[side == .left ? .leftHip : .rightHip],
        let knee = mapped[side == .left ? .leftKnee : .rightKnee],
        score > bestScore
      else { continue }

      bestScore = score
      best = SidePose(
        side: side,
        shoulder: shoulder,
        elbow: elbow,
        wrist: wrist,
        hip: hip,
        knee: knee,
        ankle: mapped[side == .left ? .leftAnkle : .rightAnkle]
      )
    }
    return best
  }
}

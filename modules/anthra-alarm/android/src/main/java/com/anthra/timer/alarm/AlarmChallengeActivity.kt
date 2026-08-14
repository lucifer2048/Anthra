package com.anthra.timer.alarm

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.Pose
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.accurate.AccuratePoseDetectorOptions
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.hypot
import kotlin.math.max

class AlarmChallengeActivity : ComponentActivity() {
  private enum class BodySide { LEFT, RIGHT }

  private data class SidePose(
    val side: BodySide,
    val nose: PoseLandmark,
    val shoulder: PoseLandmark,
    val elbow: PoseLandmark,
    val wrist: PoseLandmark,
    val hip: PoseLandmark,
    val knee: PoseLandmark,
    val ankle: PoseLandmark?,
    val heel: PoseLandmark?,
    val footIndex: PoseLandmark?,
    val trackedLength: Float,
    val confidence: Float
  )

  private lateinit var previewView: PreviewView
  private lateinit var countText: TextView
  private lateinit var guidanceText: TextView
  private lateinit var detailText: TextView
  private lateinit var flipButton: Button
  private lateinit var emergencyButton: Button

  private val cameraExecutor = Executors.newSingleThreadExecutor()
  private val detector by lazy {
    val options = AccuratePoseDetectorOptions.Builder()
      .setDetectorMode(AccuratePoseDetectorOptions.STREAM_MODE)
      .build()
    PoseDetection.getClient(options)
  }
  private val processing = AtomicBoolean(false)
  private var useFrontCamera = true
  private var preferredSide: BodySide? = null
  private var lastSidePoseAt = 0L
  private var testMode = false
  private var firedAt = 0L
  private lateinit var config: AlarmConfig
  private lateinit var repCounter: PushupRepCounter
  private var completed = false
  private val emergencyHandler = Handler(Looper.getMainLooper())
  private val emergencyAction = Runnable { emergencyStop() }

  private val cameraPermissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { granted ->
    if (granted) {
      startCamera()
    } else {
      guidanceText.text = "Camera permission is required to verify push-ups"
      detailText.text = "Open Anthra settings and allow Camera, then return to this screen."
    }
  }

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

    readConfiguration(intent)
    buildLayout()
    installBackBehavior()

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      startCamera()
    } else {
      cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    readConfiguration(intent)
    resetCounter()
  }

  override fun onDestroy() {
    emergencyHandler.removeCallbacks(emergencyAction)
    detector.close()
    cameraExecutor.shutdown()
    super.onDestroy()
  }

  private fun readConfiguration(source: Intent) {
    testMode = source.getBooleanExtra(AlarmStore.EXTRA_TEST_MODE, false)
    firedAt = source.getLongExtra(AlarmStore.EXTRA_FIRED_AT, System.currentTimeMillis())
    config = if (testMode) {
      AlarmConfig(
        id = -1,
        label = "Push-up tracking test",
        hour = 0,
        minute = 0,
        days = listOf(0, 1, 2, 3, 4, 5, 6),
        pushupTarget = source.getIntExtra(AlarmStore.EXTRA_TEST_TARGET, 3).coerceIn(1, 100),
        soundUri = "",
        soundName = "",
        enabled = false
      )
    } else {
      val alarmId = source.getIntExtra(AlarmStore.EXTRA_ALARM_ID, -1)
      AlarmStore.get(this, alarmId) ?: AlarmConfig(
        id = alarmId,
        label = "Push-up alarm",
        hour = 0,
        minute = 0,
        days = listOf(0, 1, 2, 3, 4, 5, 6),
        pushupTarget = 10,
        soundUri = "",
        soundName = "",
        enabled = true
      )
    }
    repCounter = PushupRepCounter(config.pushupTarget)
  }

  private fun buildLayout() {
    val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    previewView = PreviewView(this).apply {
      layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
      scaleType = PreviewView.ScaleType.FIT_CENTER
      implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    }
    root.addView(previewView)

    root.addView(View(this).apply {
      setBackgroundColor(Color.argb(42, 0, 0, 0))
      layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    })

    val topPanel = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(18), dp(10), dp(18), dp(10))
      background = roundedBackground(Color.argb(224, 25, 22, 23), dp(18).toFloat())
      layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
        gravity = Gravity.TOP
        setMargins(dp(18), dp(12), dp(18), 0)
      }
    }
    countText = TextView(this).apply {
      text = "0 / ${config.pushupTarget}"
      setTextColor(Color.WHITE)
      textSize = 31f
      gravity = Gravity.CENTER
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      setPadding(0, 0, dp(22), 0)
    }
    val guidanceColumn = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_VERTICAL
    }
    guidanceText = TextView(this).apply {
      text = "Turn the phone landscape and place it beside you"
      setTextColor(Color.rgb(255, 102, 117))
      textSize = 18f
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    }
    detailText = TextView(this).apply {
      text = "Side view · fit head through knees · feet are optional"
      setTextColor(Color.LTGRAY)
      textSize = 12.5f
      setPadding(0, dp(3), 0, 0)
    }
    guidanceColumn.addView(guidanceText)
    guidanceColumn.addView(detailText)
    topPanel.addView(countText)
    topPanel.addView(guidanceColumn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    root.addView(topPanel)

    val controls = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(dp(10), dp(8), dp(10), dp(8))
      background = roundedBackground(Color.argb(218, 25, 22, 23), dp(16).toFloat())
      layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
        gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        setMargins(0, 0, 0, dp(12))
      }
    }
    flipButton = Button(this).apply {
      text = "Use back camera"
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.rgb(125, 22, 40))
      setOnClickListener {
        useFrontCamera = !useFrontCamera
        text = if (useFrontCamera) "Use back camera" else "Use front camera"
        preferredSide = null
        startCamera()
      }
    }
    emergencyButton = Button(this).apply {
      text = if (testMode) "Close test" else "Hold 8s · emergency stop"
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.rgb(180, 35, 24))
      if (testMode) {
        setOnClickListener { finish() }
      } else {
        setOnTouchListener { _, event ->
          when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
              emergencyHandler.postDelayed(emergencyAction, 8_000L)
              guidanceText.text = "Keep holding for emergency stop…"
              true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
              emergencyHandler.removeCallbacks(emergencyAction)
              if (!completed) guidanceText.text = currentStageGuidance()
              true
            }
            else -> true
          }
        }
      }
    }
    controls.addView(flipButton, LinearLayout.LayoutParams(dp(220), dp(48)).apply { marginEnd = dp(8) })
    controls.addView(emergencyButton, LinearLayout.LayoutParams(dp(250), dp(48)))
    root.addView(controls)
    setContentView(root)
  }

  private fun installBackBehavior() {
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (testMode || completed) finish() else moveTaskToBack(true)
      }
    })
  }

  @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
  private fun startCamera() {
    val providerFuture = ProcessCameraProvider.getInstance(this)
    providerFuture.addListener({
      val provider = runCatching { providerFuture.get() }.getOrNull() ?: return@addListener
      val selector = if (useFrontCamera) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
      val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
      val analysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setTargetResolution(android.util.Size(1280, 720))
        .build()
      analysis.setAnalyzer(cameraExecutor) { imageProxy ->
        val mediaImage = imageProxy.image
        if (mediaImage == null || !processing.compareAndSet(false, true)) {
          imageProxy.close()
          return@setAnalyzer
        }
        val rotation = imageProxy.imageInfo.rotationDegrees
        val image = InputImage.fromMediaImage(mediaImage, rotation)
        val frameWidth = if (rotation == 90 || rotation == 270) imageProxy.height else imageProxy.width
        val frameHeight = if (rotation == 90 || rotation == 270) imageProxy.width else imageProxy.height
        detector.process(image)
          .addOnSuccessListener { pose -> processPose(pose, frameWidth, frameHeight) }
          .addOnFailureListener {
            runOnUiThread {
              guidanceText.text = "Camera tracking paused"
              detailText.text = "Keep your side profile visible from head through knees. Feet are optional."
            }
          }
          .addOnCompleteListener {
            processing.set(false)
            imageProxy.close()
          }
      }

      runCatching {
        provider.unbindAll()
        provider.bindToLifecycle(this, selector, preview, analysis)
      }.onFailure {
        guidanceText.text = "Could not start this camera"
        detailText.text = "Switch cameras, or close other apps currently using the camera."
      }
    }, ContextCompat.getMainExecutor(this))
  }

  private fun processPose(pose: Pose, frameWidth: Int, frameHeight: Int) {
    if (completed) return
    val now = System.currentTimeMillis()
    if (lastSidePoseAt > 0L && now - lastSidePoseAt > PushupRepCounter.TRACKING_RESET_MS) {
      preferredSide = null
    }
    val side = sidePose(pose)
    if (side == null) {
      repCounter.onTrackingLost(now)
      updateGuidance("Side profile not detected", "Show your head, visible arm, hips, and camera-side knee.")
      return
    }
    lastSidePoseAt = now

    val requiredPoints = listOf(
      side.nose,
      side.shoulder,
      side.elbow,
      side.wrist,
      side.hip,
      side.knee
    )
    val withinFrame = requiredPoints.all { landmark ->
      val x = landmark.position.x
      val y = landmark.position.y
      x in frameWidth * FRAME_MARGIN..frameWidth * (1f - FRAME_MARGIN) &&
        y in frameHeight * FRAME_MARGIN..frameHeight * (1f - FRAME_MARGIN)
    }
    if (side.confidence < MIN_LANDMARK_CONFIDENCE || !withinFrame) {
      repCounter.pauseStability()
      updateGuidance("Fit head through knees on screen", "Leave a little space around your head, hand, hips, and knee.")
      return
    }

    val bodyTilt = PoseGeometry.angleFromHorizontal(point2(side.shoulder), point2(side.knee))
    val profileSpread = profileSpread(pose, side.trackedLength)
    if (bodyTilt > PushupRepCounter.MAX_BODY_TILT || profileSpread > MAX_PROFILE_SPREAD) {
      repCounter.pauseStability()
      updateGuidance("Turn fully sideways", "Keep your shoulders-to-feet axis running across the landscape frame.")
      return
    }
    if (side.trackedLength < frameWidth * MIN_TRACKED_WIDTH_RATIO) {
      repCounter.pauseStability()
      updateGuidance("Move the phone closer", "Make your head-to-knee profile fill more of the landscape width.")
      return
    }

    val lowerLeg = listOfNotNull(side.ankle, side.heel, side.footIndex)
    val fullBodyTracked = lowerLeg.size == 3 && lowerLeg.all { landmark ->
      landmark.inFrameLikelihood >= MIN_OPTIONAL_LANDMARK_CONFIDENCE && isWithinFrame(landmark, frameWidth, frameHeight)
    }
    val footX = if (fullBodyTracked) lowerLeg.sumOf { it.position.x.toDouble() }.div(lowerLeg.size).toFloat() else Float.NaN
    val footY = if (fullBodyTracked) lowerLeg.sumOf { it.position.y.toDouble() }.div(lowerLeg.size).toFloat() else Float.NaN
    val sample = PushupRepCounter.Sample(
      elbowAngle = angle2D(side.shoulder, side.elbow, side.wrist),
      shoulderClearance = PoseGeometry.normalizedPerpendicularDistance(
        point2(side.wrist),
        point2(side.shoulder),
        point2(side.knee)
      ),
      bodyLineAngle = angle2D(side.shoulder, side.hip, side.knee),
      kneeAngle = if (fullBodyTracked) angle2D(side.hip, side.knee, side.ankle!!) else Double.NaN,
      bodyTilt = bodyTilt,
      wristX = side.wrist.position.x.toDouble() / frameWidth,
      wristY = side.wrist.position.y.toDouble() / frameHeight,
      fullBodyTracked = fullBodyTracked,
      footX = footX.toDouble() / frameWidth,
      footY = footY.toDouble() / frameHeight
    )
    val result = repCounter.update(sample, now)
    if (result.counted) {
      runOnUiThread { countText.text = "${result.count} / ${config.pushupTarget}" }
    }
    if (result.completed) {
      completeChallenge()
    } else {
      updateGuidance(result.title, result.detail, side.side, sample)
    }
  }

  private fun sidePose(pose: Pose): SidePose? {
    val candidates = listOfNotNull(
      sideCandidate(pose, BodySide.LEFT),
      sideCandidate(pose, BodySide.RIGHT)
    )
    val best = candidates.maxByOrNull { it.confidence } ?: return null
    val preferred = candidates.firstOrNull { it.side == preferredSide }
    val selected = if (
      preferred != null &&
      (
        best.side == preferred.side ||
          (
            preferred.confidence >= MIN_LANDMARK_CONFIDENCE &&
              best.confidence < preferred.confidence + SIDE_SWITCH_MARGIN
            )
        )
    ) {
      preferred
    } else {
      best
    }
    preferredSide = selected.side
    return selected
  }

  private fun sideCandidate(pose: Pose, side: BodySide): SidePose? {
    val nose = pose.getPoseLandmark(PoseLandmark.NOSE) ?: return null
    val requiredTypes = if (side == BodySide.LEFT) {
      intArrayOf(
        PoseLandmark.LEFT_SHOULDER,
        PoseLandmark.LEFT_ELBOW,
        PoseLandmark.LEFT_WRIST,
        PoseLandmark.LEFT_HIP,
        PoseLandmark.LEFT_KNEE
      )
    } else {
      intArrayOf(
        PoseLandmark.RIGHT_SHOULDER,
        PoseLandmark.RIGHT_ELBOW,
        PoseLandmark.RIGHT_WRIST,
        PoseLandmark.RIGHT_HIP,
        PoseLandmark.RIGHT_KNEE
      )
    }
    val landmarks = requiredTypes.map { pose.getPoseLandmark(it) ?: return null }
    val shoulder = landmarks[0]
    val knee = landmarks[4]
    val optionalTypes = if (side == BodySide.LEFT) {
      intArrayOf(PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_HEEL, PoseLandmark.LEFT_FOOT_INDEX)
    } else {
      intArrayOf(PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_HEEL, PoseLandmark.RIGHT_FOOT_INDEX)
    }
    val lowerLeg = optionalTypes.map { pose.getPoseLandmark(it) }
    val required = listOf(nose) + landmarks
    return SidePose(
      side = side,
      nose = nose,
      shoulder = shoulder,
      elbow = landmarks[1],
      wrist = landmarks[2],
      hip = landmarks[3],
      knee = knee,
      ankle = lowerLeg[0],
      heel = lowerLeg[1],
      footIndex = lowerLeg[2],
      trackedLength = distance(shoulder, knee),
      confidence = required.minOf { it.inFrameLikelihood }
    )
  }

  private fun profileSpread(pose: Pose, trackedLength: Float): Double {
    if (trackedLength <= 1f) return Double.POSITIVE_INFINITY
    val leftShoulder = pose.getPoseLandmark(PoseLandmark.LEFT_SHOULDER) ?: return 0.0
    val rightShoulder = pose.getPoseLandmark(PoseLandmark.RIGHT_SHOULDER) ?: return 0.0
    val leftHip = pose.getPoseLandmark(PoseLandmark.LEFT_HIP) ?: return 0.0
    val rightHip = pose.getPoseLandmark(PoseLandmark.RIGHT_HIP) ?: return 0.0
    val pairConfidence = minOf(
      leftShoulder.inFrameLikelihood,
      rightShoulder.inFrameLikelihood,
      leftHip.inFrameLikelihood,
      rightHip.inFrameLikelihood
    )
    if (pairConfidence < MIN_PROFILE_CONFIDENCE) return 0.0
    return max(distance(leftShoulder, rightShoulder), distance(leftHip, rightHip)).toDouble() / trackedLength
  }

  private fun updateGuidance(
    title: String,
    detail: String,
    side: BodySide? = null,
    sample: PushupRepCounter.Sample? = null
  ) {
    runOnUiThread {
      if (completed) return@runOnUiThread
      guidanceText.text = title
      detailText.text = if (side != null && sample != null) {
        val sideName = if (side == BodySide.LEFT) "Left" else "Right"
        val trackingMode = if (sample.fullBodyTracked) "full-body · knee ${formatAngle(sample.kneeAngle)}" else "compact · feet optional"
        "$detail  ·  $sideName side  ·  $trackingMode  ·  elbow ${formatAngle(sample.elbowAngle)}  ·  body ${formatAngle(sample.bodyLineAngle)}  ·  ${repCounter.motionTargetGuidance()}"
      } else {
        detail
      }
    }
  }

  private fun currentStageGuidance(): String = repCounter.currentGuidance()

  private fun completeChallenge() {
    if (completed) return
    completed = true
    if (!testMode) {
      AlarmStore.addCompletion(this, config, firedAt, repCounter.count, "completed")
      AlarmRingingService.stop(this)
    }
    runOnUiThread {
      countText.text = "${config.pushupTarget} / ${config.pushupTarget}"
      guidanceText.text = if (testMode) "Side-view tracking test passed" else "Alarm dismissed — great work"
      guidanceText.setTextColor(Color.rgb(75, 230, 164))
      detailText.text = "Verified elbow depth, chest travel, shoulder–hip–knee alignment, and a planted hand."
      emergencyHandler.postDelayed({ finish() }, 1_800L)
    }
  }

  private fun emergencyStop() {
    if (completed || testMode) return
    completed = true
    AlarmStore.addCompletion(this, config, firedAt, repCounter.count, "emergency_stopped")
    AlarmRingingService.stop(this)
    guidanceText.text = "Emergency stop used"
    detailText.text = "${repCounter.count} of ${config.pushupTarget} push-ups were verified."
    emergencyHandler.postDelayed({ finish() }, 1_000L)
  }

  private fun resetCounter() {
    completed = false
    preferredSide = null
    lastSidePoseAt = 0L
    repCounter = PushupRepCounter(config.pushupTarget)
    countText.text = "0 / ${config.pushupTarget}"
    guidanceText.text = "Turn the phone landscape and place it beside you"
    detailText.text = "Side view · fit head through knees · feet are optional"
  }

  private fun formatAngle(angle: Double): String = if (angle.isFinite()) "${angle.toInt()}°" else "--"

  private fun angle2D(a: PoseLandmark, vertex: PoseLandmark, c: PoseLandmark): Double =
    PoseGeometry.angle2D(point2(a), point2(vertex), point2(c))

  private fun point2(landmark: PoseLandmark) = PoseGeometry.Point2(
    landmark.position.x.toDouble(),
    landmark.position.y.toDouble()
  )

  private fun distance(a: PoseLandmark, b: PoseLandmark): Float = hypot(
    a.position.x - b.position.x,
    a.position.y - b.position.y
  )

  private fun isWithinFrame(landmark: PoseLandmark, frameWidth: Int, frameHeight: Int): Boolean =
    landmark.position.x in frameWidth * FRAME_MARGIN..frameWidth * (1f - FRAME_MARGIN) &&
      landmark.position.y in frameHeight * FRAME_MARGIN..frameHeight * (1f - FRAME_MARGIN)

  private fun roundedBackground(color: Int, radius: Float) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val FRAME_MARGIN = 0.02f
    private const val MIN_LANDMARK_CONFIDENCE = 0.30f
    private const val MIN_OPTIONAL_LANDMARK_CONFIDENCE = 0.25f
    private const val MIN_PROFILE_CONFIDENCE = 0.25f
    private const val MAX_PROFILE_SPREAD = 0.28
    private const val MIN_TRACKED_WIDTH_RATIO = 0.22f
    private const val SIDE_SWITCH_MARGIN = 0.10f
  }
}

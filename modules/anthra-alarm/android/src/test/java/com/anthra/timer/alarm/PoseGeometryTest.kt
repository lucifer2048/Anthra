package com.anthra.timer.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos
import kotlin.math.sin

class PoseGeometryTest {
  @Test
  fun measuresSideViewElbowFlexionInTwoDimensions() {
    val shoulder = PoseGeometry.Point2(0.0, -1.0)
    val elbow = PoseGeometry.Point2(0.0, 0.0)
    val wrist = PoseGeometry.Point2(
      sin(Math.toRadians(105.0)),
      -cos(Math.toRadians(105.0))
    )

    assertEquals(105.0, PoseGeometry.angle2D(shoulder, elbow, wrist), 0.0001)
  }

  @Test
  fun shoulderClearanceIsNormalizedAndUnaffectedByCameraRoll() {
    val shoulder = PoseGeometry.Point2(0.0, 0.0)
    val ankle = PoseGeometry.Point2(4.0, 0.0)
    val wrist = PoseGeometry.Point2(0.0, 1.0)
    val original = PoseGeometry.normalizedPerpendicularDistance(wrist, shoulder, ankle)

    assertEquals(0.25, original, 0.0001)
    assertEquals(
      original,
      PoseGeometry.normalizedPerpendicularDistance(
        rotate2D(wrist, 27.0),
        rotate2D(shoulder, 27.0),
        rotate2D(ankle, 27.0)
      ),
      0.0001
    )
  }

  @Test
  fun measuresBodyTiltFromLandscapeHorizontal() {
    assertEquals(
      30.0,
      PoseGeometry.angleFromHorizontal(
        PoseGeometry.Point2(0.0, 0.0),
        PoseGeometry.Point2(cos(Math.toRadians(30.0)), sin(Math.toRadians(30.0)))
      ),
      0.0001
    )
  }

  @Test
  fun measuresElbowFlexionThroughCameraDepth() {
    val shoulder = PoseGeometry.Point3(0.0, -1.0, 0.0)
    val elbow = PoseGeometry.Point3(0.0, 0.0, 0.0)
    // This forearm projects downward in screen X/Y and can look straight from
    // the front, but its depth component makes the true elbow angle 110°.
    val wrist = PoseGeometry.Point3(0.0, -cos(Math.toRadians(110.0)), -sin(Math.toRadians(110.0)))

    assertEquals(110.0, PoseGeometry.angle3D(shoulder, elbow, wrist), 0.0001)
  }

  @Test
  fun elbowAngleDoesNotChangeWhenThePhoneIsTilted() {
    val shoulder = PoseGeometry.Point3(-0.2, -1.0, 0.1)
    val elbow = PoseGeometry.Point3(0.0, 0.0, 0.0)
    val wrist = PoseGeometry.Point3(0.3, 0.2, -1.0)
    val original = PoseGeometry.angle3D(shoulder, elbow, wrist)

    assertEquals(original, PoseGeometry.angle3D(rotateX(shoulder, 32.0), rotateX(elbow, 32.0), rotateX(wrist, 32.0)), 0.0001)
  }

  @Test
  fun faceCenteringDoesNotRequireLevelShoulders() {
    val levelOffset = PoseGeometry.normalizedOffsetAlongAxis(
      PoseGeometry.Point2(0.0, -1.0),
      PoseGeometry.Point2(-1.0, 0.0),
      PoseGeometry.Point2(1.0, 0.0)
    )
    val tiltedOffset = PoseGeometry.normalizedOffsetAlongAxis(
      rotate2D(PoseGeometry.Point2(0.0, -1.0), 27.0),
      rotate2D(PoseGeometry.Point2(-1.0, 0.0), 27.0),
      rotate2D(PoseGeometry.Point2(1.0, 0.0), 27.0)
    )

    assertTrue(levelOffset < 0.0001)
    assertEquals(levelOffset, tiltedOffset, 0.0001)
  }

  private fun rotateX(point: PoseGeometry.Point3, degrees: Double): PoseGeometry.Point3 {
    val radians = Math.toRadians(degrees)
    return PoseGeometry.Point3(
      x = point.x,
      y = point.y * cos(radians) - point.z * sin(radians),
      z = point.y * sin(radians) + point.z * cos(radians)
    )
  }

  private fun rotate2D(point: PoseGeometry.Point2, degrees: Double): PoseGeometry.Point2 {
    val radians = Math.toRadians(degrees)
    return PoseGeometry.Point2(
      x = point.x * cos(radians) - point.y * sin(radians),
      y = point.x * sin(radians) + point.y * cos(radians)
    )
  }
}

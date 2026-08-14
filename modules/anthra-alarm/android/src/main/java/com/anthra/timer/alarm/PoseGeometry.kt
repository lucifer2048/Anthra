package com.anthra.timer.alarm

import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.sqrt

/** Camera-orientation-independent geometry used by the pose tracker. */
internal object PoseGeometry {
  data class Point2(val x: Double, val y: Double)
  data class Point3(val x: Double, val y: Double, val z: Double)

  fun angle2D(first: Point2, vertex: Point2, last: Point2): Double {
    val firstX = first.x - vertex.x
    val firstY = first.y - vertex.y
    val lastX = last.x - vertex.x
    val lastY = last.y - vertex.y
    val denominator = hypot(firstX, firstY) * hypot(lastX, lastY)
    if (denominator <= 0.0001) return Double.NaN
    val cosine = ((firstX * lastX + firstY * lastY) / denominator).coerceIn(-1.0, 1.0)
    return Math.toDegrees(acos(cosine))
  }

  fun angle3D(first: Point3, vertex: Point3, last: Point3): Double {
    val firstX = first.x - vertex.x
    val firstY = first.y - vertex.y
    val firstZ = first.z - vertex.z
    val lastX = last.x - vertex.x
    val lastY = last.y - vertex.y
    val lastZ = last.z - vertex.z
    val firstLength = sqrt(firstX * firstX + firstY * firstY + firstZ * firstZ)
    val lastLength = sqrt(lastX * lastX + lastY * lastY + lastZ * lastZ)
    val denominator = firstLength * lastLength
    if (denominator <= 0.0001) return Double.NaN
    val cosine = (
      (firstX * lastX + firstY * lastY + firstZ * lastZ) / denominator
      ).coerceIn(-1.0, 1.0)
    return Math.toDegrees(acos(cosine))
  }

  /**
   * Distance along an arbitrary body axis, normalized by that axis' length.
   * Unlike comparing screen X/Y directly, this is unchanged when the phone is
   * rolled or propped at an angle.
   */
  fun normalizedOffsetAlongAxis(point: Point2, axisStart: Point2, axisEnd: Point2): Double {
    val axisX = axisEnd.x - axisStart.x
    val axisY = axisEnd.y - axisStart.y
    val axisLengthSquared = axisX * axisX + axisY * axisY
    if (axisLengthSquared <= 0.0001) return Double.POSITIVE_INFINITY
    val midpointX = (axisStart.x + axisEnd.x) / 2.0
    val midpointY = (axisStart.y + axisEnd.y) / 2.0
    return abs((point.x - midpointX) * axisX + (point.y - midpointY) * axisY) / axisLengthSquared
  }

  /** Perpendicular point-to-axis distance divided by the axis length. */
  fun normalizedPerpendicularDistance(point: Point2, axisStart: Point2, axisEnd: Point2): Double {
    val axisX = axisEnd.x - axisStart.x
    val axisY = axisEnd.y - axisStart.y
    val axisLengthSquared = axisX * axisX + axisY * axisY
    if (axisLengthSquared <= 0.0001) return Double.POSITIVE_INFINITY
    val pointX = point.x - axisStart.x
    val pointY = point.y - axisStart.y
    return abs(pointX * axisY - pointY * axisX) / axisLengthSquared
  }

  /** Acute angle between a body axis and the landscape screen's horizontal. */
  fun angleFromHorizontal(first: Point2, last: Point2): Double {
    val x = abs(last.x - first.x)
    val y = abs(last.y - first.y)
    if (x + y <= 0.0001) return Double.NaN
    return Math.toDegrees(atan2(y, x))
  }
}

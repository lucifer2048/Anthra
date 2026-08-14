import Foundation

enum PoseGeometry {
  struct Point2 {
    let x: Double
    let y: Double
  }

  struct Point3 {
    let x: Double
    let y: Double
    let z: Double
  }

  static func angle2D(first: Point2, vertex: Point2, last: Point2) -> Double {
    let firstX = first.x - vertex.x
    let firstY = first.y - vertex.y
    let lastX = last.x - vertex.x
    let lastY = last.y - vertex.y
    let denominator = hypot(firstX, firstY) * hypot(lastX, lastY)
    if denominator <= 0.0001 { return .nan }
    let cosine = ((firstX * lastX + firstY * lastY) / denominator).clamped(to: -1.0...1.0)
    return acos(cosine) * 180.0 / .pi
  }

  static func angle3D(first: Point3, vertex: Point3, last: Point3) -> Double {
    let firstX = first.x - vertex.x
    let firstY = first.y - vertex.y
    let firstZ = first.z - vertex.z
    let lastX = last.x - vertex.x
    let lastY = last.y - vertex.y
    let lastZ = last.z - vertex.z
    let firstLength = sqrt(firstX * firstX + firstY * firstY + firstZ * firstZ)
    let lastLength = sqrt(lastX * lastX + lastY * lastY + lastZ * lastZ)
    let denominator = firstLength * lastLength
    if denominator <= 0.0001 { return .nan }
    let cosine = ((firstX * lastX + firstY * lastY + firstZ * lastZ) / denominator).clamped(to: -1.0...1.0)
    return acos(cosine) * 180.0 / .pi
  }

  static func normalizedOffsetAlongAxis(point: Point2, axisStart: Point2, axisEnd: Point2) -> Double {
    let axisX = axisEnd.x - axisStart.x
    let axisY = axisEnd.y - axisStart.y
    let axisLengthSquared = axisX * axisX + axisY * axisY
    if axisLengthSquared <= 0.0001 { return .infinity }
    let midpointX = (axisStart.x + axisEnd.x) / 2.0
    let midpointY = (axisStart.y + axisEnd.y) / 2.0
    return abs((point.x - midpointX) * axisX + (point.y - midpointY) * axisY) / axisLengthSquared
  }

  static func normalizedPerpendicularDistance(point: Point2, axisStart: Point2, axisEnd: Point2) -> Double {
    let axisX = axisEnd.x - axisStart.x
    let axisY = axisEnd.y - axisStart.y
    let axisLengthSquared = axisX * axisX + axisY * axisY
    if axisLengthSquared <= 0.0001 { return .infinity }
    let pointX = point.x - axisStart.x
    let pointY = point.y - axisStart.y
    return abs(pointX * axisY - pointY * axisX) / axisLengthSquared
  }

  static func angleFromHorizontal(first: Point2, last: Point2) -> Double {
    let x = abs(last.x - first.x)
    let y = abs(last.y - first.y)
    if x + y <= 0.0001 { return .nan }
    return atan2(y, x) * 180.0 / .pi
  }
}

private extension Comparable {
  func clamped(to range: ClosedRange<Self>) -> Self {
    min(max(self, range.lowerBound), range.upperBound)
  }
}

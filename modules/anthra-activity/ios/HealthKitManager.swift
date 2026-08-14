import Foundation
import HealthKit
import UIKit

struct HealthConnectStatusPayload {
  let availability: String
  let stepsPermission: Bool
  let exercisePermission: Bool

  var connected: Bool {
    availability == "available" && stepsPermission && exercisePermission
  }

  func toDictionary() -> [String: Any] {
    [
      "availability": availability,
      "stepsPermission": stepsPermission,
      "exercisePermission": exercisePermission,
      "connected": connected
    ]
  }
}

final class HealthKitManager {
  private let store = HKHealthStore()

  private var stepType: HKQuantityType? {
    HKObjectType.quantityType(forIdentifier: .stepCount)
  }

  private var workoutType: HKObjectType {
    HKObjectType.workoutType()
  }

  func availability() -> String {
    HKHealthStore.isHealthDataAvailable() ? "available" : "unavailable"
  }

  func status() async -> HealthConnectStatusPayload {
    let availability = availability()
    guard availability == "available",
          let stepType else {
      return HealthConnectStatusPayload(
        availability: availability,
        stepsPermission: false,
        exercisePermission: false
      )
    }

    async let stepsGranted = canRead(type: stepType)
    async let workoutsGranted = canRead(type: workoutType)
    return HealthConnectStatusPayload(
      availability: availability,
      stepsPermission: await stepsGranted,
      exercisePermission: await workoutsGranted
    )
  }

  private func canRead(type: HKObjectType) async -> Bool {
    if #available(iOS 15.0, *) {
      let status = store.authorizationStatus(for: type)
      if status == .sharingDenied {
        return false
      }
    }
    do {
      if let quantityType = type as? HKQuantityType {
        _ = try await sumQuantity(
          type: quantityType,
          predicate: HKQuery.predicateForSamples(
            withStart: Date().addingTimeInterval(-86_400),
            end: Date(),
            options: .strictStartDate
          )
        )
        return true
      }
      if type == workoutType {
        _ = try await readWorkouts(startTimeMs: Int64(Date().addingTimeInterval(-86_400).timeIntervalSince1970 * 1000), endTimeMs: Int64(Date().timeIntervalSince1970 * 1000))
        return true
      }
      return false
    } catch let error as NSError {
      if error.domain == HKError.errorDomain,
         error.code == HKError.errorAuthorizationDenied.rawValue {
        return false
      }
      return true
    }
  }

  func requestPermissions() async throws -> [String: Bool] {
    guard availability() == "available",
          let stepType else {
      throw NSError(domain: "AnthraActivity", code: 10, userInfo: [
        NSLocalizedDescriptionKey: "Health data is not available on this device."
      ])
    }

    let readTypes: Set<HKObjectType> = [stepType, workoutType]
    try await store.requestAuthorization(toShare: [], read: readTypes)
    let status = await status()
    return [
      "stepsPermission": status.stepsPermission,
      "exercisePermission": status.exercisePermission
    ]
  }

  func readDailyTotals(startTimeMs: Int64, endTimeMs: Int64, timezone: String) async throws -> [[String: Any]] {
    guard let stepType else { return [] }
    let status = await status()
    guard status.stepsPermission else {
      throw NSError(domain: "AnthraActivity", code: 11, userInfo: [
        NSLocalizedDescriptionKey: "Health step permission is not granted."
      ])
    }

    let zone = TimeZone(identifier: timezone) ?? .current
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    var results: [[String: Any]] = []
    var cursor = Date(timeIntervalSince1970: Double(startTimeMs) / 1000)
    let endDate = Date(timeIntervalSince1970: Double(endTimeMs) / 1000)

    while cursor < endDate {
      let dayStart = calendar.startOfDay(for: cursor)
      guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { break }
      let boundedStart = max(dayStart, Date(timeIntervalSince1970: Double(startTimeMs) / 1000))
      let boundedEnd = min(dayEnd, endDate)
      let predicate = HKQuery.predicateForSamples(withStart: boundedStart, end: boundedEnd, options: .strictStartDate)
      let steps = try await sumQuantity(type: stepType, predicate: predicate)
      let components = calendar.dateComponents([.year, .month, .day], from: dayStart)
      let dateKey = String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
      results.append([
        "dateKey": dateKey,
        "timezone": zone.identifier,
        "steps": steps == nil ? NSNull() : Double(steps ?? 0),
        "originPackages": ["com.apple.health"]
      ])
      cursor = dayEnd
    }
    return results
  }

  func readWorkouts(startTimeMs: Int64, endTimeMs: Int64) async throws -> [[String: Any]] {
    let status = await status()
    guard status.exercisePermission else {
      throw NSError(domain: "AnthraActivity", code: 12, userInfo: [
        NSLocalizedDescriptionKey: "Health workout permission is not granted."
      ])
    }

    let start = Date(timeIntervalSince1970: Double(startTimeMs) / 1000)
    let end = Date(timeIntervalSince1970: Double(endTimeMs) / 1000)
    let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

    return try await withCheckedThrowingContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: workoutType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        let workouts = (samples as? [HKWorkout] ?? []).map { workout -> [String: Any] in
          [
            "externalId": workout.uuid.uuidString,
            "clientRecordId": NSNull(),
            "clientRecordVersion": 0,
            "originPackage": workout.sourceRevision.source.bundleIdentifier,
            "title": workout.workoutActivityType.name,
            "exerciseType": workout.workoutActivityType.rawValue,
            "startTime": workout.startDate.timeIntervalSince1970 * 1000,
            "endTime": workout.endDate.timeIntervalSince1970 * 1000,
            "lastModifiedTime": workout.endDate.timeIntervalSince1970 * 1000
          ]
        }
        continuation.resume(returning: workouts)
      }
      store.execute(query)
    }
  }

  func openSettings() {
    if let url = URL(string: "x-apple-health://") {
      DispatchQueue.main.async {
        UIApplication.shared.open(url)
      }
    } else {
      guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
      DispatchQueue.main.async {
        UIApplication.shared.open(url)
      }
    }
  }

  private func sumQuantity(type: HKQuantityType, predicate: NSPredicate) async throws -> Int? {
    try await withCheckedThrowingContinuation { continuation in
      let query = HKStatisticsQuery(
        quantityType: type,
        quantitySamplePredicate: predicate,
        options: .cumulativeSum
      ) { _, statistics, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let quantity = statistics?.sumQuantity() else {
          continuation.resume(returning: nil)
          return
        }
        continuation.resume(returning: Int(quantity.doubleValue(for: .count())))
      }
      store.execute(query)
    }
  }
}

private extension HKWorkoutActivityType {
  var name: String {
    switch self {
    case .running: return "Running"
    case .walking: return "Walking"
    case .cycling: return "Cycling"
    case .traditionalStrengthTraining: return "Strength Training"
    case .yoga: return "Yoga"
    default: return "Workout"
    }
  }
}

import CoreMotion
import ExpoModulesCore
import Foundation

public class AnthraActivityModule: Module {
  private let stepCounter = StepCounterManager()
  private let healthKit = HealthKitManager()

  public func definition() -> ModuleDefinition {
    Name("AnthraActivity")

    OnCreate {
      if self.stepCounter.isTrackingEnabled() {
        self.stepCounter.startLiveUpdatesIfNeeded()
      }
    }

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      let version = ProcessInfo.processInfo.operatingSystemVersion
      return [
        "platform": "ios",
        "apiLevel": version.majorVersion,
        "stepCounterAvailable": self.stepCounter.hasStepCounter(),
        "activityRecognitionRequired": false,
        "healthConnectAvailability": self.healthKit.availability()
      ]
    }

    AsyncFunction("getPhoneStepStatus") { () -> [String: Any] in
      if self.stepCounter.isTrackingEnabled() && self.stepCounter.hasPermission() && self.stepCounter.hasStepCounter() {
        self.stepCounter.startLiveUpdatesIfNeeded()
      }
      let state = self.stepCounter.lastState()
      var result: [String: Any] = [
        "sensorAvailable": self.stepCounter.hasStepCounter(),
        "permissionGranted": self.stepCounter.hasPermission(),
        "trackingEnabled": self.stepCounter.isTrackingEnabled(),
        "steps": Double(state?.steps ?? 0)
      ]
      if let state {
        result["dateKey"] = state.dayKey
        result["timezone"] = state.timezone
        result["lastRaw"] = Double(state.lastRaw)
      } else {
        result["dateKey"] = NSNull()
        result["timezone"] = NSNull()
        result["lastRaw"] = NSNull()
      }
      return result
    }

    AsyncFunction("setPhoneStepTrackingEnabled") { (enabled: Bool) in
      if enabled && (!self.stepCounter.hasStepCounter() || !self.stepCounter.hasPermission()) {
        throw Exception(
          name: "STEP_TRACKING_SERVICE_FAILED",
          description: "The step sensor or motion permission is unavailable."
        )
      }
      self.stepCounter.setTrackingEnabled(enabled)
    }

    AsyncFunction("getCurrentRawStepReading") { (timezone: String) -> [String: Any] in
      try await withCheckedThrowingContinuation { continuation in
        self.stepCounter.requestReading(timezone: timezone) { result in
          switch result {
          case .success(let update):
            continuation.resume(returning: update.toDictionary())
          case .failure(let error):
            continuation.resume(throwing: error)
          }
        }
      }
    }

    Function("cancelCurrentRawStepReading") {
      self.stepCounter.cancelReading()
    }

    AsyncFunction("getPendingPhoneStepDays") { () -> [[String: Any]] in
      self.stepCounter.pendingDays().map {
        [
          "dateKey": $0.dateKey,
          "timezone": $0.timezone,
          "steps": Double($0.steps)
        ]
      }
    }

    AsyncFunction("acknowledgePendingPhoneStepDays") { (dateKeys: [String]) in
      self.stepCounter.acknowledgePendingDays(Set(dateKeys))
    }

    AsyncFunction("getHealthConnectStatus") { () -> [String: Any] in
      await self.healthKit.status().toDictionary()
    }

    AsyncFunction("requestHealthConnectPermissions") { () -> [String: Bool] in
      try await self.healthKit.requestPermissions()
    }

    AsyncFunction("readHealthConnectDailyTotals") { (startTime: Double, endTime: Double, timezone: String) -> [[String: Any]] in
      try await self.healthKit.readDailyTotals(
        startTimeMs: Int64(startTime),
        endTimeMs: Int64(endTime),
        timezone: timezone
      )
    }

    AsyncFunction("readHealthConnectWorkouts") { (startTime: Double, endTime: Double) -> [[String: Any]] in
      try await self.healthKit.readWorkouts(
        startTimeMs: Int64(startTime),
        endTimeMs: Int64(endTime)
      )
    }

    AsyncFunction("openHealthConnectSettings") {
      self.healthKit.openSettings()
    }
  }
}

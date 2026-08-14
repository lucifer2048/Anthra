import CoreMotion
import Foundation

final class StepCounterManager {
  private let pedometer = CMPedometer()
  private let defaults = UserDefaults(suiteName: "anthra.activity.steps.v1") ?? .standard
  private let queue = OperationQueue()
  private var readingCompletion: ((Result<StepCounterUpdate, Error>) -> Void)?
  private var liveUpdatesHandler: ((StepCounterUpdate) -> Void)?

  private enum Keys {
    static let enabled = "enabled"
    static let day = "dayKey"
    static let timezone = "timezone"
    static let bootCount = "bootCount"
    static let baselineRaw = "baselineRaw"
    static let lastRaw = "lastRaw"
    static let steps = "steps"
    static let pendingDays = "pendingDays"
    static let lastUptime = "lastSystemUptime"
    static let bootId = "bootId"
    static let disabledAt = "disabledAt"
  }

  func hasStepCounter() -> Bool {
    CMPedometer.isStepCountingAvailable()
  }

  func hasPermission() -> Bool {
    switch CMMotionActivityManager.authorizationStatus() {
    case .authorized, .notDetermined:
      return true
    default:
      return false
    }
  }

  func isTrackingEnabled() -> Bool {
    defaults.bool(forKey: Keys.enabled)
  }

  func setTrackingEnabled(_ enabled: Bool) {
    defaults.set(enabled, forKey: Keys.enabled)
    if enabled {
      startLiveUpdatesIfNeeded()
    } else {
      stopLiveUpdates()
      if let state = lastState() {
        savePendingDay(StepDaySnapshot(dateKey: state.dayKey, timezone: state.timezone, steps: state.steps))
      }
      defaults.set(Date().timeIntervalSince1970 * 1000, forKey: Keys.disabledAt)
    }
  }

  func lastState() -> StepCounterState? {
    guard let dayKey = defaults.string(forKey: Keys.day),
          let timezone = defaults.string(forKey: Keys.timezone) else {
      return nil
    }
    return StepCounterState(
      dayKey: dayKey,
      timezone: timezone,
      bootCount: defaults.integer(forKey: Keys.bootCount),
      baselineRaw: defaults.object(forKey: Keys.baselineRaw) as? Int64 ?? 0,
      lastRaw: defaults.object(forKey: Keys.lastRaw) as? Int64 ?? 0,
      steps: defaults.object(forKey: Keys.steps) as? Int64 ?? 0
    )
  }

  func pendingDays() -> [StepDaySnapshot] {
    guard let data = defaults.data(forKey: Keys.pendingDays),
          let decoded = try? JSONDecoder().decode([StoredPendingDay].self, from: data) else {
      return []
    }
    return decoded.map { StepDaySnapshot(dateKey: $0.dateKey, timezone: $0.timezone, steps: $0.steps) }
  }

  func acknowledgePendingDays(_ dateKeys: Set<String>) {
    let remaining = pendingDays().filter { !dateKeys.contains($0.dateKey) }
    persistPendingDays(remaining)
  }

  func cancelReading() {
    readingCompletion = nil
  }

  func requestReading(timezone: String, completion: @escaping (Result<StepCounterUpdate, Error>) -> Void) {
    guard hasStepCounter() else {
      completion(.failure(NSError(domain: "AnthraActivity", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "This device does not expose a step counter."
      ])))
      return
    }
    readingCompletion = completion
    let safeZone = TimeZone(identifier: timezone) ?? .current
    let startOfDay = Self.startOfDay(in: safeZone)
    pedometer.queryPedometerData(from: startOfDay, to: Date()) { [weak self] data, error in
      guard let self else { return }
      if let error {
        self.readingCompletion?(.failure(error))
        self.readingCompletion = nil
        return
      }
      let raw = Int64(truncating: data?.numberOfSteps ?? 0)
      let dayKey = Self.dayKey(for: Date(), timeZone: safeZone)
      let update = self.recordReading(raw: raw, timezone: safeZone.identifier, dayKey: dayKey)
      if let update {
        self.readingCompletion?(.success(update))
      } else {
        self.readingCompletion?(.failure(NSError(domain: "AnthraActivity", code: 2, userInfo: [
          NSLocalizedDescriptionKey: "Step reading was rejected."
        ])))
      }
      self.readingCompletion = nil
    }
  }

  func startLiveUpdatesIfNeeded() {
    guard isTrackingEnabled(), hasStepCounter() else { return }
    let safeZone = TimeZone.current
    let startOfDay = Self.startOfDay(in: safeZone)
    pedometer.startUpdates(from: startOfDay) { [weak self] data, _ in
      guard let self, let data else { return }
      let raw = Int64(truncating: data.numberOfSteps)
      let dayKey = Self.dayKey(for: Date(), timeZone: safeZone)
      _ = self.recordReading(raw: raw, timezone: safeZone.identifier, dayKey: dayKey)
    }
  }

  func stopLiveUpdates() {
    pedometer.stopUpdates()
  }

  @discardableResult
  private func recordReading(raw: Int64, timezone: String, dayKey: String) -> StepCounterUpdate? {
    guard isTrackingEnabled() || readingCompletion != nil else { return nil }
    let previous = lastState()
    let disabledAt = defaults.double(forKey: Keys.disabledAt)
    let effectivePrevious: StepCounterState? = {
      if disabledAt > 0, let previous, previous.dayKey != dayKey {
        return nil
      }
      return previous
    }()
    guard let update = StepCounterNormalizer.update(
      previous: effectivePrevious,
      rawReading: raw,
      dayKey: dayKey,
      timezone: timezone,
      bootCount: currentBootCount(),
      permissionGranted: hasPermission()
    ) else {
      return nil
    }

    if disabledAt > 0 {
      defaults.removeObject(forKey: Keys.disabledAt)
    }

    if let rolledDay = update.rolledOverDayKey,
       let rolledTimezone = update.rolledOverTimezone,
       let rolledSteps = update.rolledOverSteps {
      savePendingDay(StepDaySnapshot(dateKey: rolledDay, timezone: rolledTimezone, steps: rolledSteps))
    }
    persist(update.state)
    return update
  }

  private func persist(_ state: StepCounterState) {
    defaults.set(state.dayKey, forKey: Keys.day)
    defaults.set(state.timezone, forKey: Keys.timezone)
    defaults.set(state.bootCount, forKey: Keys.bootCount)
    defaults.set(state.baselineRaw, forKey: Keys.baselineRaw)
    defaults.set(state.lastRaw, forKey: Keys.lastRaw)
    defaults.set(state.steps, forKey: Keys.steps)
  }

  private func savePendingDay(_ day: StepDaySnapshot) {
    var days = pendingDays()
    days.removeAll { $0.dateKey == day.dateKey }
    days.append(day)
    persistPendingDays(days)
  }

  private func persistPendingDays(_ days: [StepDaySnapshot]) {
    let stored = days.map { StoredPendingDay(dateKey: $0.dateKey, timezone: $0.timezone, steps: $0.steps) }
    if let data = try? JSONEncoder().encode(stored) {
      defaults.set(data, forKey: Keys.pendingDays)
    }
  }

  private func currentBootCount() -> Int {
    let uptime = ProcessInfo.processInfo.systemUptime
    let lastUptime = defaults.double(forKey: Keys.lastUptime)
    var bootId = defaults.integer(forKey: Keys.bootId)
    if lastUptime > 0, uptime < lastUptime - 60 {
      bootId += 1
      defaults.set(bootId, forKey: Keys.bootId)
    }
    defaults.set(uptime, forKey: Keys.lastUptime)
    return bootId
  }

  private static func startOfDay(in timeZone: TimeZone) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    return calendar.startOfDay(for: Date())
  }

  private static func dayKey(for date: Date, timeZone: TimeZone) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
  }

  private struct StoredPendingDay: Codable {
    let dateKey: String
    let timezone: String
    let steps: Int64
  }
}

extension StepCounterUpdate {
  func toDictionary() -> [String: Any] {
    var result: [String: Any] = [
      "raw": Double(state.lastRaw),
      "dateKey": state.dayKey,
      "timezone": state.timezone,
      "baselineRaw": Double(state.baselineRaw),
      "steps": Double(state.steps),
      "counterReset": counterReset,
      "rebootDetected": rebootDetected,
      "timezoneChanged": timezoneChanged
    ]
    if let rolledOverDayKey {
      result["rolledOverDayKey"] = rolledOverDayKey
    } else {
      result["rolledOverDayKey"] = NSNull()
    }
    if let rolledOverTimezone {
      result["rolledOverTimezone"] = rolledOverTimezone
    } else {
      result["rolledOverTimezone"] = NSNull()
    }
    if let rolledOverSteps {
      result["rolledOverSteps"] = Double(rolledOverSteps)
    } else {
      result["rolledOverSteps"] = NSNull()
    }
    return result
  }
}

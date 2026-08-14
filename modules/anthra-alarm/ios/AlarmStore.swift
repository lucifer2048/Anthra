import Foundation

struct AlarmConfig: Codable {
  var id: Int
  var label: String
  var hour: Int
  var minute: Int
  var days: [Int]
  var pushupTarget: Int
  var soundUri: String
  var soundName: String
  var enabled: Bool
  var timezone: String
  var requiresPushups: Bool

  static let defaultTimezone = "Asia/Kolkata"

  init(
    id: Int,
    label: String,
    hour: Int,
    minute: Int,
    days: [Int],
    pushupTarget: Int,
    soundUri: String,
    soundName: String,
    enabled: Bool,
    timezone: String = defaultTimezone,
    requiresPushups: Bool = true
  ) {
    self.id = id
    self.label = label
    self.hour = hour
    self.minute = minute
    self.days = days.isEmpty ? [0, 1, 2, 3, 4, 5, 6] : days
    self.pushupTarget = min(100, max(1, pushupTarget))
    self.soundUri = soundUri
    self.soundName = soundName
    self.enabled = enabled
    self.timezone = timezone.isEmpty ? Self.defaultTimezone : timezone
    self.requiresPushups = requiresPushups
  }

  init?(dictionary: [String: Any]) {
    guard let id = dictionary["id"] as? Int else { return nil }
    let rawDays = dictionary["days"] as? [Int] ?? []
    let days = rawDays.filter { (0...6).contains($0) }
    self.id = id
    self.label = ((dictionary["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
      ? dictionary["label"] as? String
      : "Push-up alarm") ?? "Push-up alarm"
    self.hour = min(23, max(0, dictionary["hour"] as? Int ?? 7))
    self.minute = min(59, max(0, dictionary["minute"] as? Int ?? 0))
    self.days = days.isEmpty ? [0, 1, 2, 3, 4, 5, 6] : Array(Set(days)).sorted()
    self.pushupTarget = min(100, max(1, dictionary["pushupTarget"] as? Int ?? 10))
    self.soundUri = dictionary["soundUri"] as? String ?? ""
    self.soundName = dictionary["soundName"] as? String ?? "System alarm"
    self.enabled = dictionary["enabled"] as? Bool ?? true
    self.timezone = (dictionary["timezone"] as? String)?.isEmpty == false
      ? dictionary["timezone"] as? String ?? Self.defaultTimezone
      : Self.defaultTimezone
    if dictionary.keys.contains("requiresPushups") {
      self.requiresPushups = dictionary["requiresPushups"] as? Bool ?? (id > 0)
    } else {
      self.requiresPushups = id > 0
    }
  }

  func toDictionary() -> [String: Any] {
    [
      "id": id,
      "label": label,
      "hour": hour,
      "minute": minute,
      "days": days,
      "pushupTarget": pushupTarget,
      "soundUri": soundUri,
      "soundName": soundName,
      "enabled": enabled,
      "timezone": timezone,
      "requiresPushups": requiresPushups
    ]
  }
}

struct AlarmCompletionRecord: Codable {
  let eventId: String
  let alarmId: Int?
  let label: String
  let firedAt: Int64
  let completedAt: Int64
  let targetReps: Int
  let completedReps: Int
  let status: String
}

enum AlarmStore {
  static let firedAtKey = "anthra_alarm_fired_at"
  static let alarmIdKey = "anthra_alarm_id"
  static let testModeKey = "anthra_alarm_test_mode"
  static let testTargetKey = "anthra_alarm_test_target"
  static let dismissKey = "anthra_alarm_dismiss"

  private static let prefsSuite = "anthra.pushup.alarms.v1"
  private static let alarmsKey = "alarms"
  private static let completionsKey = "completion_events"

  private static var defaults: UserDefaults {
    UserDefaults(suiteName: prefsSuite) ?? .standard
  }

  static func save(_ config: AlarmConfig) {
    var root = readAlarmRoot()
    root[String(config.id)] = config.toDictionary()
    if let data = try? JSONSerialization.data(withJSONObject: root),
       let json = String(data: data, encoding: .utf8) {
      defaults.set(json, forKey: alarmsKey)
    }
  }

  static func remove(_ alarmId: Int) {
    var root = readAlarmRoot()
    root.removeValue(forKey: String(alarmId))
    if let data = try? JSONSerialization.data(withJSONObject: root),
       let json = String(data: data, encoding: .utf8) {
      defaults.set(json, forKey: alarmsKey)
    }
  }

  static func clearAlarms() {
    defaults.set("{}", forKey: alarmsKey)
  }

  static func get(_ alarmId: Int) -> AlarmConfig? {
    guard let dict = readAlarmRoot()[String(alarmId)] as? [String: Any] else { return nil }
    return AlarmConfig(dictionary: dict)
  }

  static func all() -> [AlarmConfig] {
    readAlarmRoot().compactMap { _, value in
      guard let dict = value as? [String: Any] else { return nil }
      return AlarmConfig(dictionary: dict)
    }
  }

  static func addCompletion(
    config: AlarmConfig,
    firedAt: Int64,
    completedReps: Int,
    status: String
  ) {
    if config.id < 0 { return }
    var entries = readCompletions()
    entries.append([
      "eventId": UUID().uuidString,
      "alarmId": config.id > 0 ? config.id : NSNull(),
      "label": config.label,
      "firedAt": firedAt,
      "completedAt": Int64(Date().timeIntervalSince1970 * 1000),
      "targetReps": config.pushupTarget,
      "completedReps": max(0, completedReps),
      "status": status == "emergency_stopped" ? "emergency_stopped" : "completed"
    ])
    let trimmed = Array(entries.suffix(200))
    if let data = try? JSONSerialization.data(withJSONObject: trimmed),
       let json = String(data: data, encoding: .utf8) {
      defaults.set(json, forKey: completionsKey)
    }
  }

  static func consumeCompletions() -> [[String: Any]] {
    let entries = readCompletions()
    defaults.removeObject(forKey: completionsKey)
    return entries
  }

  private static func readAlarmRoot() -> [String: Any] {
    guard let json = defaults.string(forKey: alarmsKey),
          let data = json.data(using: .utf8),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return [:]
    }
    return root
  }

  private static func readCompletions() -> [[String: Any]] {
    guard let json = defaults.string(forKey: completionsKey),
          let data = json.data(using: .utf8),
          let root = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return []
    }
    return root
  }
}

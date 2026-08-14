import AVFoundation
import Foundation
import UIKit
import UserNotifications

enum AlarmScheduler {
  private static let center = UNUserNotificationCenter.current()

  static func requestAuthorizationIfNeeded() async throws {
    let settings = await center.notificationSettings()
    guard settings.authorizationStatus == .notDetermined else { return }
    let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
    if !granted {
      throw NSError(
        domain: "AnthraAlarm",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Allow Notifications before enabling this alarm."]
      )
    }
  }

  static func notificationsAuthorized() async -> Bool {
    let settings = await center.notificationSettings()
    return settings.authorizationStatus == .authorized
      || settings.authorizationStatus == .provisional
  }

  static func schedule(_ config: AlarmConfig, afterMillis: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) async throws -> Int64 {
    AlarmStore.save(config)
    await cancelPending(for: config.id)
    guard config.enabled else { return 0 }

    try await requestAuthorizationIfNeeded()
    let authorized = await notificationsAuthorized()
    guard authorized else {
      throw NSError(
        domain: "AnthraAlarm",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Allow Notifications before enabling this alarm."]
      )
    }

    if config.requiresPushups {
      guard AlarmPermissions.cameraAuthorizationStatus() == .authorized else {
        throw NSError(
          domain: "AnthraAlarm",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "Allow Camera access before enabling a push-up alarm."]
        )
      }
    }

    let content = UNMutableNotificationContent()
    content.title = config.label
    content.body = config.requiresPushups
      ? "Complete \(config.pushupTarget) push-ups to dismiss"
      : "Workout reminder"
    content.sound = .default
    content.categoryIdentifier = "ANTHRA_ALARM"
    content.userInfo = [
      AlarmStore.alarmIdKey: config.id,
      "requiresPushups": config.requiresPushups,
      "pushupTarget": config.pushupTarget,
      "label": config.label
    ]

    for day in config.days {
      var dateComponents = DateComponents()
      dateComponents.hour = config.hour
      dateComponents.minute = config.minute
      dateComponents.weekday = day + 1
      let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
      let request = UNNotificationRequest(
        identifier: notificationIdentifier(alarmId: config.id, weekday: day),
        content: content,
        trigger: trigger
      )
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        center.add(request) { error in
          if let error {
            continuation.resume(throwing: error)
          } else {
            continuation.resume()
          }
        }
      }
    }

    return nextTrigger(config: config, afterMillis: afterMillis)
  }

  static func cancel(_ alarmId: Int, removeStoredConfig: Bool) async {
    await cancelPending(for: alarmId)
    if removeStoredConfig {
      AlarmStore.remove(alarmId)
    }
  }

  static func rescheduleAll() async {
    for config in AlarmStore.all() where config.enabled {
      _ = try? await schedule(config)
    }
  }

  static func nextTrigger(config: AlarmConfig, afterMillis: Int64) -> Int64 {
    let timeZone = TimeZone(identifier: config.timezone) ?? .current
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let afterDate = Date(timeIntervalSince1970: Double(afterMillis) / 1000.0)
    let daySet = Set(config.days)

    for offset in 0...8 {
      guard let candidateDay = calendar.date(byAdding: .day, value: offset, to: afterDate) else { continue }
      let weekday = (calendar.component(.weekday, from: candidateDay) + 6) % 7
      guard daySet.contains(weekday) else { continue }
      var components = calendar.dateComponents([.year, .month, .day], from: candidateDay)
      components.hour = config.hour
      components.minute = config.minute
      components.second = 0
      components.timeZone = timeZone
      guard let timestamp = calendar.date(from: components)?.timeIntervalSince1970 else { continue }
      let millis = Int64(timestamp * 1000)
      if millis > afterMillis + 1_000 {
        return millis
      }
    }
    return afterMillis
  }

  private static func notificationIdentifier(alarmId: Int, weekday: Int) -> String {
    "anthra-alarm-\(alarmId)-day-\(weekday)"
  }

  private static func cancelPending(for alarmId: Int) async {
    let identifiers = (0...6).map { notificationIdentifier(alarmId: alarmId, weekday: $0) }
    center.removePendingNotificationRequests(withIdentifiers: identifiers)
    center.removeDeliveredNotifications(withIdentifiers: identifiers)
  }
}

enum AlarmPermissions {
  static func cameraAuthorizationStatus() -> AVAuthorizationStatus {
    AVCaptureDevice.authorizationStatus(for: .video)
  }

  static func openNotificationSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    DispatchQueue.main.async {
      UIApplication.shared.open(url)
    }
  }
}

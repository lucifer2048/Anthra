import Foundation
import UIKit
import UserNotifications

final class AlarmNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
  static let shared = AlarmNotificationDelegate()

  func configure() {
    UNUserNotificationCenter.current().delegate = self
    registerCategories()
    Task {
      await AlarmScheduler.rescheduleAll()
    }
  }

  private func registerCategories() {
    let dismiss = UNNotificationAction(
      identifier: "ANTHRA_ALARM_OPEN",
      title: "Open challenge",
      options: [.foreground]
    )
    let category = UNNotificationCategory(
      identifier: "ANTHRA_ALARM",
      actions: [dismiss],
      intentIdentifiers: [],
      options: [.customDismissAction]
    )
    UNUserNotificationCenter.current().setNotificationCategories([category])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge])
    handleNotification(notification, fromUserTap: false)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    handleNotification(response.notification, fromUserTap: true)
    completionHandler()
  }

  private func handleNotification(_ notification: UNNotification, fromUserTap: Bool) {
    let userInfo = notification.request.content.userInfo
    guard let alarmId = userInfo[AlarmStore.alarmIdKey] as? Int else { return }
    let requiresPushups = userInfo["requiresPushups"] as? Bool ?? true
    let firedAt = Int64(Date().timeIntervalSince1970 * 1000)
    if requiresPushups {
      AlarmChallengePresenter.shared.presentAlarm(alarmId: alarmId, firedAt: firedAt)
    } else if fromUserTap {
      AlarmChallengePresenter.shared.presentAlarm(alarmId: alarmId, firedAt: firedAt)
    }
  }
}

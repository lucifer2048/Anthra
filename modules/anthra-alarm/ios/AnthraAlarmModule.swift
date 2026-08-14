import ExpoModulesCore
import Foundation

public class AnthraAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AnthraAlarm")

    OnCreate {
      AlarmNotificationDelegate.shared.configure()
    }

    AsyncFunction("scheduleAlarm") { (source: [String: Any]) -> [String: Double] in
      guard let config = AlarmConfig(dictionary: source) else {
        throw Exception(name: "ALARM_SCHEDULE_FAILED", description: "Invalid alarm payload.")
      }
      let nextTrigger = try await AlarmScheduler.schedule(config)
      return ["nextTriggerAt": Double(nextTrigger)]
    }

    AsyncFunction("cancelAlarm") { (alarmId: Int) in
      await AlarmScheduler.cancel(alarmId, removeStoredConfig: true)
    }

    AsyncFunction("clearAllAlarms") {
      for config in AlarmStore.all() where config.id > 0 {
        await AlarmScheduler.cancel(config.id, removeStoredConfig: false)
        AlarmStore.remove(config.id)
      }
    }

    AsyncFunction("pickAlarmSound") { (_ currentUri: String) -> [String: String] in
      // iOS does not expose the Android ringtone picker. Use the system alarm sound.
      return [
        "uri": currentUri.isEmpty ? "system://default" : currentUri,
        "name": "System alarm"
      ]
    }

    AsyncFunction("getPermissionStatus") { () -> [String: Bool] in
      let notifications = await AlarmScheduler.notificationsAuthorized()
      let camera = AlarmPermissions.cameraAuthorizationStatus() == .authorized
      return [
        "nativeSupported": true,
        "exactAlarm": notifications,
        "fullScreenIntent": notifications && camera
      ]
    }

    AsyncFunction("openExactAlarmSettings") {
      AlarmPermissions.openNotificationSettings()
    }

    AsyncFunction("openFullScreenIntentSettings") {
      AlarmPermissions.openNotificationSettings()
    }

    AsyncFunction("startTestChallenge") { (target: Int) in
      let clamped = min(100, max(1, target))
      await MainActor.run {
        AlarmChallengePresenter.shared.presentTestChallenge(target: clamped)
      }
    }

    AsyncFunction("consumeCompletionEvents") { () -> [[String: Any]] in
      AlarmStore.consumeCompletions().map { entry in
        var mapped = entry
        if mapped["alarmId"] is NSNull {
          mapped["alarmId"] = NSNull()
        }
        return mapped
      }
    }
  }
}

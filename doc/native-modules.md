# Native modules

Local Expo modules under `modules/` provide Alarm Buddy and Activity Buddy native bridges. JS accesses them through `NativeModules.AnthraAlarm` and `NativeModules.AnthraActivity` (`src/utils/alarmNative.ts`, `src/features/activity/activityNative.ts`).

## Modules

| Module | Path | JS bridge |
|--------|------|-----------|
| Alarm Buddy | `modules/anthra-alarm` | `src/utils/alarmNative.ts` |
| Activity Buddy | `modules/anthra-activity` | `src/features/activity/activityNative.ts` |

Both are registered as file dependencies in root `package.json` and autolinked via `expo-module.config.json` + CocoaPods on iOS.

## iOS parity (Aug 2026)

### Alarm Buddy (`modules/anthra-alarm/ios/`)

Swift files:

- `AnthraAlarmModule.swift` — Expo module exposing the JS API
- `AlarmStore.swift` — UserDefaults persistence for alarms and completion events
- `AlarmScheduler.swift` — `UNUserNotificationCenter` recurring schedules
- `AlarmNotificationDelegate.swift` — foreground/tap handling
- `AlarmChallengeViewController.swift` — camera + Vision body-pose push-up challenge
- `PushupRepCounter.swift`, `PoseGeometry.swift` — rep logic ported from Android

Config: `plugins/withAnthraAlarm.js` adds notification usage strings; `app.json` `ios.infoPlist` includes camera/notification copy.

**Works on iOS**

- Schedule/cancel/clear recurring alarms (weekday + hour/minute)
- Workout reminder alarms (no push-ups)
- Push-up challenge test flow and alarm dismiss UI (Vision `VNDetectHumanBodyPoseRequest`)
- Completion event queue consumed by JS
- Permission status + open Settings for notifications

**iOS limitations vs Android**

- No custom alarm sound picker — returns system default (`pickAlarmSound`)
- No full-screen intent over lock screen; user opens app from notification banner
- Recurring notifications follow device local calendar; explicit alarm timezone is stored for `nextTriggerAt` but iOS cannot mirror Android exact-alarm semantics
- No foreground alarm ringing service; notification sound only until challenge opens
- Push-up pose rules are MVP parity (same state machine, simplified side selection vs Android ML Kit)

### Activity Buddy (`modules/anthra-activity/ios/`)

Swift files:

- `AnthraActivityModule.swift` — Expo module exposing the JS API
- `StepCounterNormalizer.swift` — day rollover / reboot logic ported from Kotlin
- `StepCounterManager.swift` — `CMPedometer` phone steps + pending day snapshots
- `HealthKitManager.swift` — HealthKit steps + workouts (maps to Health Connect JS types)

Config: `plugins/withAnthraActivity.js` + `app.json` add HealthKit entitlement and `NSHealthShareUsageDescription`, `NSMotionUsageDescription`.

**Works on iOS**

- Phone step tracking via `CMPedometer` with normalizer parity
- Pending day rollover snapshots
- HealthKit read for daily step totals and workouts
- Permission request + open Apple Health / Settings

**iOS limitations vs Android**

- Background step updates depend on iOS (foreground + periodic refresh; no always-on sensor service)
- HealthKit read authorization is opaque — permission flags use query-based detection
- `originPackages` for HealthKit totals is simplified (`com.apple.health`)
- No Health Connect `update_required` path

## Rebuild required

After changing native code or config plugins:

```bash
npx expo prebuild --platform ios
cd ios && pod install
npx expo run:ios
```

Android continues to use the Kotlin implementations under each module’s `android/` tree.

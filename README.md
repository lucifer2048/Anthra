# Anthra (Expo / React Native)

Offline personal-planning app with:

- Circuit plans (work/rest + global loops)
- 5-second ready lead-in
- Work/Rest/Complete phase UI
- Audio + haptic cues
- Local SQLite workout logs
- Weekly streak logic (goal: 4 workouts Mon-Sun)
- 1080x2160 streak report sharing
- Local workout and task reminders with notification actions
- Password Buddy with PIN and biometric unlock
- List Buddy and Reminder Buddy modules
- Tracker Buddy with flexible recurrence, per-task alerts, daily streaks, and weekly/monthly reports
- Alarm Buddy with exact IST alarms and on-device push-up verification (Android)
- Activity Buddy with phone steps, Health Connect, goals, history, and a separate Activity Streak (Android)
- Versioned JSON backup/restore for non-vault app data

## Stack

- Expo SDK 54
- React Native + TypeScript
- NativeWind (Tailwind)
- expo-sqlite
- expo-haptics
- expo-audio
- expo-notifications + expo-task-manager
- expo-local-authentication + expo-secure-store
- react-native-view-shot + expo-sharing

## Project docs & Cursor rules

Engineering standards live under [`doc/`](./doc/README.md) (source of truth). Short binding Cursor rules in [`.cursor/rules/`](./.cursor/rules/) point at those docs — especially reusable UI in [`doc/reusable-ui.md`](./doc/reusable-ui.md) and the kit in `src/components/ui/`.

## Run

Use Node 20 LTS or Node 22. The project intentionally rejects Node 23+.

```bash
npm install
npm run start
```

If your phone cannot open the LAN URL, use:

```bash
npm run start:tunnel
```

Then open on Android via Expo Go or run:

```bash
npm run android
```

Notification actions, background processing, biometrics, and secure storage require a development build; Expo Go does not provide the complete native behavior.

## Alarm Buddy

Alarm Buddy schedules user-facing alarms in `Asia/Kolkata` (IST). When an alarm fires, Anthra loops the selected device alarm sound and opens a side-view landscape camera challenge. The tracker automatically follows whichever side of the body is clearer and requires the head-to-knee profile, a planted hand, shoulder–hip–knee alignment, verified elbow/chest depth, and a return to full arm extension. When the lower leg is visible, it automatically adds knee-extension and planted-foot checks. Camera frames are processed on-device and are never saved or uploaded.

Before relying on an alarm:

1. Open **Alarm Buddy** from the Anthra hub and grant Camera, Notifications, Alarms & reminders, and full-screen alarm access.
2. Run **Test camera with 3 push-ups** on the physical Android phone that will run the alarm.
3. Turn the phone landscape and prop it securely perpendicular to the user's side, about 30–60 cm above the floor. Start around 1–1.5 metres away and adjust until the required landmarks fit; either camera works.
4. Fit the head, visible arm, hips, and camera-side knee inside the frame with a small margin. Ankles and feet are optional, and the user may face either left or right.
5. Plant hands and feet and hold a straight-arm plank until calibration completes. Lower with the hips and legs aligned until the visible elbow reaches 110° or less and the shoulder reaches verified depth, then return to full extension.

Compact side-view mode rejects incomplete depth, large hip misalignment, a front-facing body, and substantial hand movement. If ankles and feet are visible, full-body mode additionally rejects bent knees and substantial foot movement. Pose estimation still cannot replace human judging, so run the three-rep camera test in the intended room before relying on an alarm.

The normal alarm UI has no dismiss or snooze action. For injury, camera failure, or another unsafe situation, holding **Emergency stop** for eight seconds stops the alarm and records an incomplete result.

Alarm Buddy uses native Android alarm and camera APIs, so it does not run in Expo Go or an emulator without a usable camera. Rebuild the Android development client after pulling native changes:

```bash
npm run android
```

## Activity Buddy

Activity Buddy is Android-first and offline-first. Phone tracking uses
`Sensor.TYPE_STEP_COUNTER`, not accelerometer inference, and asks for Physical
activity permission only when the user explicitly enables the phone source. The
sensor is read only while Activity Buddy is active or refreshing; there is no
foreground step service. Android step sensors can report with latency, so totals
are personal activity estimates rather than medical measurements.

On Android 9 and newer, Activity Buddy can read user-approved aggregated steps
and exercise sessions from Health Connect. Health Connect totals are
authoritative when connected and are never added to phone-sensor totals. Anthra
does not request background health access, location, distance, calories, or
write access in this milestone.

Activity settings, summaries, source metadata, imported workouts, sync state,
and step checkpoints remain in dedicated local SQLite tables. This health and
activity information is deliberately excluded from Anthra JSON backups.
Existing backup versions 1 and 2 remain supported. The share card is generated
locally and is handed directly to the operating system share sheet only after
the user previews and confirms it.

Workout plans can also be shared from the Plans tab as portable Anthra JSON files.
Recipients use Plans → Import to choose the file, preview it, and confirm before a
new local copy is added. Plans → Import can also read a legacy `anthra://plan/import`
link copied from a message. No plan data is uploaded.

Activity Buddy requires a native Android build and is not available in Expo Go:

```bash
npm run android
```

## Verify

```bash
npm run typecheck
npm run test:activity
npx expo export --platform android --output-dir /tmp/anthra-export
cd android && ./gradlew :app:assembleDebug
```

## Local Data Model

- `plans`
- `exercises` (per plan)
- `workout_logs` (completed sessions)
- `alarms` and `alarm_logs` (IST push-up alarms and completion results)
- `activity_*` and `step_sensor_checkpoints` (local Activity Buddy data; never exported)
- `tracker_buddy_*` (versioned tasks, schedules, and completion history)
- `meta` (streak marker + current streak)

All data stays on-device. Vault secrets use the operating system's secure storage when available. JSON backups intentionally exclude Password Buddy credentials and all Activity Buddy health information. No network APIs, analytics, or trackers are used.

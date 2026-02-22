# Anthra (Expo / React Native)

Minimalist offline interval timer with:

- Circuit plans (work/rest + global loops)
- 5-second ready lead-in
- Work/Rest/Complete phase UI
- Audio + haptic cues
- Local SQLite workout logs
- Weekly streak logic (goal: 4 workouts Mon-Sun)
- 1080x1080 streak card sharing

## Stack

- Expo SDK 50+
- React Native + TypeScript
- NativeWind (Tailwind)
- expo-sqlite
- expo-haptics
- expo-av
- react-native-view-shot + expo-sharing

## Run

Use Node 20 LTS (Expo SDK 50 is not reliable on Node 24+).

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

## Local Data Model

- `plans`
- `exercises` (per plan)
- `workout_logs` (completed sessions)
- `meta` (streak marker + current streak)

All data stays on-device. No network APIs, analytics, or trackers are used.

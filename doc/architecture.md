# Architecture

## Product shape

Anthra is an Expo / React Native Android app (package `com.anthra.timer`). Entry: `App.tsx` switches `activeModule`:

`hub | workout | reminder | password | list | alarm | activity | tracker`

There is no Expo Router / React Navigation stack for module routing. Buddy screens own their own tab bars where needed.

## Layers

```
App.tsx / feature screens
        ↓
src/components/ui  (presentational)
src/features/<domain>  (screens, repos, domain logic)
        ↓
src/db + Secure Store
        ↓
Android native modules (Alarm, Activity) via JS bridges
```

## Native modules

| Bridge | Native |
|--------|--------|
| `src/utils/alarmNative.ts` | `AnthraAlarmModule` + challenge UI |
| `src/features/activity/activityNative.ts` | `AnthraActivityModule` + step / Health Connect |

Native-only features require a development / EAS build — not Expo Go.

## Data

- SQLite: `anthra.db` via `expo-sqlite`
- Vault secrets: `expo-secure-store`
- Backups: versioned JSON; vault credentials and Activity Buddy health tables are excluded where documented in backup code

## Design system

`src/design-system/` provides light/dark semantic colors, spacing, radii, typography, motion, and layout. Screens consume via `useAnthraTheme()`.

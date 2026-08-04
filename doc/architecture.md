# Architecture

## Product shape

Entry: Expo → `App.tsx` → `AppProviders` (`src/providers/AppProviders.tsx`: GestureHandler → SafeAreaProvider → ThemeProvider) → module screens.

Module switch: `activeModule` = `hub | workout | reminder | password | list | alarm | activity | tracker`

Extracted buddy screens (owned outside `App.tsx`): hub, activity, tracker, alarm, reminder (`src/features/reminder/ReminderBuddyScreen.tsx`), workout (`src/features/workout/WorkoutBuddyScreen.tsx`). Vault and list still largely live in `App.tsx` / legacy components. Timer session UI stays in `App.tsx` via `TimerScreen` while a plan is active.

There is no Expo Router / React Navigation stack for module routing. Buddy screens own their own tab bars where needed. See [app-providers.md](./app-providers.md).

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

Module roots wrap in `ScreenLayout` (`src/components/layout`) with backgrounds from `useScreenBackgrounds()` so fills go edge-to-edge while content respects safe areas. See [screen-layout-system.md](./screen-layout-system.md).

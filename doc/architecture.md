# Architecture

## Product shape

Entry: Expo Router (`expo-router/entry`) → `app/_layout.tsx` → `AppShellProvider` (`src/app-shell/AppShellProvider.tsx`) → `AppProviders` → file routes under `app/`.

Module navigation uses Expo Router file routes (`app/index.tsx`, `app/workout.tsx`, `app/activity.tsx`, …) with helpers in `src/app-shell/navigation.ts`. Shared app state and handlers live in `AppShellContext` / `useAppShell()`. Overlays (`WorkoutFeedbackModals`, `LaunchOverlay`, timer push) render from `AppShellChrome`. Buddy screens own their own tab bars where needed. See [app-providers.md](./app-providers.md), [account.md](./account.md), and [social.md](./social.md).

### Extracted feature screens

| Module | Owner |
|--------|--------|
| Hub | `src/features/hub/AnthraHomeScreen.tsx` |
| Workout (+ profile/settings sections) | `src/features/workout/WorkoutBuddyScreen.tsx` |
| Reminder | `src/features/reminder/ReminderBuddyScreen.tsx` |
| Vault (`password`) | `src/features/vault/VaultBuddyScreen.tsx` |
| List | `src/features/list/ListBuddyScreen.tsx` |
| Alarm | `src/features/alarm/AlarmBuddyScreen.tsx` (compat re-export: `src/components/AlarmBuddyScreen.tsx`) |
| Activity | `src/features/activity/ActivityBuddyScreen.tsx` |
| Nutrition | `src/features/nutrition/NutritionBuddyScreen.tsx` |
| Tracker | `src/features/tracker/` |
| Account | `src/features/account/AccountScreen.tsx` |
| Friends / leaderboard | `src/features/social/FriendsScreen.tsx` |

Timer session UI is `app/timer.tsx` (`TimerScreen`) while a plan is active; session feedback is `WorkoutFeedbackModals` in `AppShellChrome`. Extraction tracker: [app-shell-extraction.md](./app-shell-extraction.md).

## Layers

```
app/ routes / feature screens
        ↓
src/components/ui  (presentational)
src/features/<domain>  (screens, repos, domain logic)
        ↓
src/db + Secure Store          ← local source of truth
src/services/supabaseClient    ← optional; null when env unset
        ↓
Android native modules (Alarm, Activity) via JS bridges
```

## Optional cloud

When Supabase env is configured (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`):

- Auth + profile: [account.md](./account.md)
- Friends, privacy, leaderboards, friend-activity push: [social.md](./social.md)
- Private nutrition sync + meal analysis Edge Function: [nutrition.md](./nutrition.md)
- SQL / Edge setup: [`supabase/README.md`](../supabase/README.md)

Guest builds without those env vars skip cloud providers’ network work and keep buddy modules on SQLite only.

## Native modules

Local Expo modules under `modules/` (see [native-modules.md](./native-modules.md)). Config plugins in `plugins/` survive `expo prebuild --clean`.

| Bridge | Android | iOS |
|--------|---------|-----|
| `src/utils/alarmNative.ts` | `AnthraAlarm` — exact alarms, full-screen challenge (CameraX + ML Kit) | `AnthraAlarm` — local notifications + Vision push-up challenge |
| `src/features/activity/activityNative.ts` | `AnthraActivity` — hardware step counter + Health Connect | `AnthraActivity` — CMPedometer + HealthKit |

Alarm and Activity Buddy require a **development / EAS build** — not Expo Go.

## Data

- SQLite: `anthra.db` via `expo-sqlite` (local SoT)
- Vault secrets: `expo-secure-store` (device-bound; not in JSON backups)
- Auth session (when cloud configured): Secure Store via `supabaseClient`
- Backups: versioned JSON (`anthra-backup` v1–v6). Current export is **v6** and includes nutrition + activity tables. Vault credentials remain excluded. Older backup versions restore with empty filler tables for features that did not exist yet (`backupCompatibility.ts`).

## Design system

`src/design-system/` provides light/dark semantic colors, spacing, radii, typography, motion, and layout. Screens consume via `useAnthraTheme()`.

Module roots wrap in `ScreenLayout` (`src/components/layout`) with backgrounds from `useScreenBackgrounds()` so fills go edge-to-edge while content respects safe areas. See [screen-layout-system.md](./screen-layout-system.md).

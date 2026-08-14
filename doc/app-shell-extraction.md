# App shell extraction tracker

Track phased extraction of logic out of the original monolithic `App.tsx` into feature screens, Expo Router routes, and `src/app-shell/`.

**Pattern:** docs first → extract → `npx tsc --noEmit` → mark phase ✅ in this file.

**Target end state:** Entry is `expo-router/entry` → `app/_layout.tsx`. `AppShellProvider` composes focused hooks under `src/app-shell/hooks/` and exposes shared state via `useAppShell()`. Route files under `app/` are thin wrappers. Feature UIs live under `src/features/<domain>/` or `src/components/`. `App.tsx` is a legacy re-export stub only.

---

## Progress

| Phase | Status | Outcome |
|-------|--------|---------|
| 0 — Foundation (docs, UI kit, ScreenLayout, AppProviders) | ✅ | `doc/`, `.cursor/rules/`, `src/components/layout`, `src/providers` |
| 1 — Reminder Buddy | ✅ | `src/features/reminder/ReminderBuddyScreen.tsx` |
| 2 — Workout Buddy (tabs UI) | ✅ | `src/features/workout/WorkoutBuddyScreen.tsx`; timer stays App-owned |
| 3 — Vault Buddy | ✅ | `src/features/vault/VaultBuddyScreen.tsx`; App only routes `password` module |
| 4 — Shared helpers | ✅ | `src/utils/format.ts`; workout/reminder helpers re-export |
| 5 — Session feedback modals | ✅ | `src/features/workout/WorkoutFeedbackModals.tsx`; App keeps feedback state |
| 6 — List Buddy home | ✅ | `src/features/list/ListBuddyScreen.tsx` (+ deprecated re-export stub) |
| 7 — Shell polish | ✅ | Dead imports trimmed; architecture updated |
| 8 — Cloud modules (account / social / nutrition) | ✅ | Features under `src/features/{account,social,nutrition}`; providers in `AppProviders`; App routes modules |
| 9 — Alarm Buddy home | ✅ | `src/features/alarm/AlarmBuddyScreen.tsx`; native bridge remains `src/utils/alarmNative.ts`; compat re-export stub under `src/components/` |
| 10 — Expo Router + app-shell hooks | ✅ | `app/` file routes + `src/app-shell/` (`AppShellProvider`, hooks, `AppShellChrome`, `navigation.ts`); `App.tsx` legacy stub |
| 11 — Native modules (Alarm + Activity) | ✅ | `modules/anthra-{alarm,activity}/` + `plugins/withAnthra*.js`; survives `expo prebuild --clean`; see [native-modules.md](./native-modules.md) |

**Shell line counts (original `App.tsx` → current)**

| Checkpoint | Lines |
|------------|-------|
| Pre-extraction | ~4620 |
| After Reminder | ~3278 |
| After Workout | ~2388 |
| After Vault + format utils | ~1702 |
| After feedback + list + polish | ~1565 |
| After cloud modules + module switch | ~1638 |
| After Expo Router migration (monolithic `AppShellProvider`) | ~1585 |
| After hook split (`AppShellProvider` composition layer) | **~283** |

Feature UIs and route files stay outside the shell; shell growth after Phase 8 was orchestration, not buddy UI.

---

## Phase 3 — Vault Buddy ✅

`VaultBuddyScreen` owns security, entries, PIN/entry/reset modals, unlock-on-enter, lock on background/unmount. App only routes `password`.

---

## Phase 4 — Shared helpers ✅

`src/utils/format.ts`: `digitsOnly`, `withAlpha`, `parseStrictWholeNumber`, `parsePositiveNumber`, `formatMetricValue`, `normalizeReminderLeadMinutes`, `ensureThreeLeadInputs`.

Optional leftover: local copies inside `PlanEditorModal`.

---

## Phase 5 — Workout feedback modals ✅

`WorkoutFeedbackModals` at App root with controlled props. App still owns feedback state + `closeTimer` → `openSessionFeedback`.

---

## Phase 6 — List path cleanup ✅

`src/features/list/ListBuddyScreen.tsx`. Stub: `src/components/ListBuddyScreen.tsx` re-exports for compatibility.

---

## Phase 7 — Shell polish ✅

- Removed unused feedback-only imports from App (`Star`, Modal cluster, etc.)
- Architecture + this tracker updated

---

## Phase 8 — Cloud modules ✅

- Account + Social providers; local installation schema; Friends/Account/Nutrition screens
- App owns module switch + `AccountOnboardingGate` + `localDataReady` wiring
- Docs: [account.md](./account.md), [social.md](./social.md), [nutrition.md](./nutrition.md)

---

## Phase 9 — Alarm Buddy ✅

- Screen under `src/features/alarm/`; native bridge `src/utils/alarmNative.ts` → local module `modules/anthra-alarm/` (see [native-modules.md](./native-modules.md))
- Deprecated stub: `src/components/AlarmBuddyScreen.tsx`

---

## Phase 10 — Expo Router + app-shell hooks ✅

- **Entry:** `package.json` `"main": "expo-router/entry"`; routes in `app/` (`index`, `workout`, `activity`, …)
- **Navigation:** `src/app-shell/navigation.ts` (`router.push`, `goHub`); iOS swipe-back via stack options in `app/_layout.tsx` (disabled on hub + timer)
- **Shell split** under `src/app-shell/`:
  - `constants.ts` — `INITIAL_STATS`, `INITIAL_SETTINGS`, `resolveModuleTheme`
  - `hooks/useAppBootstrap.ts` — DB init, refresh fns, theme, splash, plans/stats/history
  - `hooks/useNotificationSync.ts` — `syncAllNotifications`, notification listener, AppState refresh
  - `hooks/useWorkoutShell.ts` — plans, timer/session, profile, settings, backup, feedback, deep links
  - `hooks/useAppShellUi.ts` — keyboard, hub scroll/animation refs
  - `hooks/useAppNavigationHandlers.ts` — `onOpen*` callbacks
  - `AppShellChrome.tsx` — timer push, Android back, feedback modals, splash overlay
  - `AppShellProvider.tsx` — composes hooks + `AppShellContext`
- **`App.tsx`:** legacy re-export stub (not loaded at runtime)

---

## Phase 11 — Native modules (Alarm + Activity) ✅

- **`modules/anthra-alarm/`** — Alarm Buddy Kotlin (+ iOS Swift), CameraX/ML Kit, manifest components
- **`modules/anthra-activity/`** — Activity Buddy Kotlin (+ iOS Swift), Health Connect / HealthKit, step service
- **`plugins/`** — `withAnthraAlarm`, `withAnthraActivity`, `withAnthraReleaseSigning` registered in `app.json`
- **Do not** edit generated `android/` Kotlin for alarm/activity — change `modules/` and re-run prebuild
- Docs: [native-modules.md](./native-modules.md)

---

## Intentionally stays in app shell (long term)

| Concern | Why |
|---------|-----|
| `AppProviders` tree | Wraps routes after shell bootstrap |
| `useAppBootstrap` | DB init, theme, splash; feeds `localDataReady` |
| Expo Router stack (`app/_layout.tsx`) | File-based navigation + iOS gestures |
| Shared `plans` / `stats` / `settings` for hub + workout | Hub needs them |
| `TimerScreen` push when `activePlan` set | Session overlay across routes |
| Feedback *state* + `WorkoutFeedbackModals` in `AppShellChrome` | Must outlive workout screen remount |
| `useNotificationSync` + plan deep links | Cross-feature |
| Backup export/import orchestration | Touches many domains (UI in Workout settings) |
| `AccountOnboardingGate` in `app/_layout.tsx` | Must wrap stack after providers |

---

## Rules while extracting

Follow `doc/change-checklist.md` and `doc/screen-layout-system.md`:

1. Search kit before inventing UI
2. New screens use `ScreenLayout` + `useScreenBackgrounds()`
3. No DB in `src/components/ui/*`
4. Update this tracker when a phase completes

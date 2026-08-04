# App shell extraction tracker

Track phased extraction of logic out of `App.tsx` into feature screens and shared modules.

**Pattern:** docs first → extract → `npx tsc --noEmit` → mark phase ✅ in this file.

**Target end state:** `App.tsx` is a thin shell — providers, bootstrap, module switch, timer session, notification/deep-link orchestration. Feature UIs live under `src/features/<domain>/` or `src/components/` with screen-owned state.

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
| 7 — Shell polish | ✅ | Dead imports trimmed; architecture updated; App.tsx ~1565 |

**App.tsx line counts**

| Checkpoint | Lines |
|------------|-------|
| Pre-extraction | ~4620 |
| After Reminder | ~3278 |
| After Workout | ~2388 |
| After Vault + format utils | ~1702 |
| After feedback + list + polish | **~1565** |

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
- Further optional: `useAppBootstrap` / `useNotificationSync` hooks — not required for this pass

---

## Intentionally stays in App (long term)

| Concern | Why |
|---------|-----|
| `AppProviders` + splash | Entry |
| DB bootstrap / theme load | Once at startup |
| Module switch (`activeModule`) | Router |
| Shared `plans` / `stats` / `settings` for hub + workout | Hub needs them |
| `TimerScreen` when `activePlan` set | Session overlay across modules |
| Feedback *state* + `WorkoutFeedbackModals` mount | Must outlive workout screen remount |
| Notification response listener + plan deep links | App-level |
| `syncAllNotifications` / AppState refresh | Cross-feature |
| Backup export/import orchestration | Touches many domains (UI in Workout settings) |

---

## Rules while extracting

Follow `doc/change-checklist.md` and `doc/screen-layout-system.md`:

1. Search kit before inventing UI
2. New screens use `ScreenLayout` + `useScreenBackgrounds()`
3. No DB in `src/components/ui/*`
4. Update this tracker when a phase completes

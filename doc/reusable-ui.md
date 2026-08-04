# Reusable UI kit

**Kit home:** `src/components/ui/`  
**Import:** `import { Button, ChoiceRow, … } from "../components/ui"` (adjust depth)

This doc is the source of truth for shared UI. Cursor rule `reusable-ui-components.mdc` enforces it.

## Mandatory rule

When building or editing screens:

1. **Prefer an existing kit component** over a new `Pressable`/`Text`/`View` cluster that duplicates kit visuals.
2. If nothing fits, **extend the kit** (new props or a new file under `ui/`) instead of copying markup into a screen.
3. Feature-only chrome (timer focus layout, vault PIN security copy, share-card export layouts, charts) may stay local — see [Leave feature-specific](#leave-feature-specific).
4. After adding a kit component, **export it from** `src/components/ui/index.ts` and list it below.

## Inventory

| Component | Role |
|-----------|------|
| `Button` | Primary actions |
| `IconButton` | Icon-only actions |
| `TextField` | Labeled text inputs |
| `ScreenHeader` | Back + title + optional action |
| `Surface` / `Card` | Elevated / bordered panels |
| `SwitchRow` | Settings-style labeled switch |
| `StatusBanner` | Inline alert / feedback |
| `KeyboardAwareScrollView` | Form scrolling with keyboard |
| `ProgressBar` | Animated progress track |
| `ChoiceRow` / `ChoiceChip` | Single-select chip row (replaces ad-hoc chips + old `QuickChoiceRow`) |
| `WeekdayPicker` | Multi-select weekday chips (`WEEKDAY_OPTIONS`) |
| `EmptyState` | Icon + title + body + optional CTA |
| `SectionHeader` | Section title + meta / action |
| `BottomTabBar` | Shared bottom tabs |
| `ToastBanner` | Absolutely positioned status toast |
| `FormDialog` | Centered modal shell + footer actions |
| `SheetDialog` | Bottom sheet modal shell + footer actions |
| `ScreenShell` | SafeArea + header + padded body + optional footer |
| `TimePickerField` | Time field + optional preset chips |

## Leave feature-specific

Do **not** force these into generic kit components unless a third consumer appears:

- `StreakCard` / `ActivityStreakCard` (fixed export dimensions)
- `TimerScreen` interval hero chrome
- `ActivityHistoryChart` / tracker heatmaps
- Vault PIN / reset security flows (may still use `FormDialog` shell)
- Reminder month calendar grid
- Hub `ActionCard` spring CTA
- `AppearanceControl`, `LaunchOverlay`
- Alarm camera challenge UI (native)

## Migration plan

### Phase 0 — Hygiene ✅ (target)

- Move `ProgressBar`, `TimePickerField` into `ui/`
- Replace `QuickChoiceRow` / `WorkoutChoiceRow` with `ChoiceRow`
- Re-export from `ui/index.ts`; keep thin path aliases if needed during migrate

### Phase 1 — Selection

- Harden `ChoiceRow` (wrap / equal layouts)
- Add `WeekdayPicker`
- Migrate: Alarm days/targets, Plan editor chips/days, Tracker weekdays, TimePicker presets, Activity share scope, Reminder mode chips in `App.tsx`

### Phase 2 — Structure

- `EmptyState`, `SectionHeader`, `BottomTabBar`, `ToastBanner`
- Collapse `ReminderTabBar` / `WorkoutTabBar` / `TrackerTabBar` to thin wrappers over `BottomTabBar`

### Phase 3 — Dialogs

- `FormDialog` / `SheetDialog`
- Migrate List / Tracker / Plan nested modals and Alarm / Reminder sheet shells

### Phase 4 — Screen chrome

- `ScreenShell` on Buddy screens that already use `ScreenHeader`
- Continue extracting Reminder / Workout UI from `App.tsx` onto the kit

### Phase 5 — Optional

- Generic list-row only if ≥3 entity cards still share structure after dialog/empty extraction

## Checklist for new UI

- [ ] Checked inventory above
- [ ] Used tokens via `useAnthraTheme()`
- [ ] No DB / repository imports in the new presentational piece
- [ ] Exported from `ui/index.ts` if shared
- [ ] Updated this inventory table

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

### Phase 0 — Hygiene ✅

- Moved `ProgressBar`, `TimePickerField` into `ui/`
- Replaced `QuickChoiceRow` / `WorkoutChoiceRow` with `ChoiceRow`
- Thin re-exports remain at old paths for compatibility

### Phase 1 — Selection ✅

- `ChoiceRow` / `ChoiceChip` with wrap + equal layouts
- `WeekdayPicker` on Alarm, Plan editor, Tracker task editor
- Activity share scope uses `ChoiceRow`

### Phase 2 — Structure ✅

- `EmptyState`, `SectionHeader`, `BottomTabBar`, `ToastBanner`
- Reminder / Workout / Tracker tab bars are thin wrappers over `BottomTabBar`
- Empty states migrated on Alarm, List, Tracker

### Phase 3 — Dialogs ✅ (partial)

- `FormDialog` / `SheetDialog` available in kit
- Migrated List category/item modals and Tracker rename/create modal
- Alarm / Reminder / Plan nested editors can adopt `SheetDialog` / `FormDialog` next

### Phase 4 — Screen chrome ✅ (kit ready)

- `ScreenShell` available; adopt on Buddy screens when extracting from `App.tsx`

### Phase 5 — Optional

- Generic list-row only if ≥3 entity cards still share structure after dialog/empty extraction

## Checklist for new UI

- [ ] Checked inventory above
- [ ] Used tokens via `useAnthraTheme()`
- [ ] No DB / repository imports in the new presentational piece
- [ ] Exported from `ui/index.ts` if shared
- [ ] Updated this inventory table

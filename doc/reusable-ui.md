# Reusable UI kit

**Kit home:** `src/components/ui/`  
**Import:** `import { Button, ChoiceRow, … } from "../components/ui"` (adjust depth)

This doc is the source of truth for shared UI. Cursor rules `ui-reuse-gate.mdc` (always on) and `reusable-ui-components.mdc` enforce it. Full process: `doc/change-checklist.md`.

## Mandatory rule

When building or editing screens **or adding any feature with UI**:

1. **Read** `doc/change-checklist.md` and this inventory first.
2. **Prefer an existing kit component** over a new `Pressable`/`Text`/`View` cluster that duplicates kit visuals.
3. If the same UI already exists in a screen but is not reusable, **extract it into the kit**, then use it.
4. If nothing fits but the pattern is generic (chips, empty state, dialog, section header, tab bar, form chrome), **add it to the kit** — do not wait for a second copy.
5. Feature-only chrome may stay local only if listed under [Leave feature-specific](#leave-feature-specific).
6. After adding a kit component, **export it from** `src/components/ui/index.ts` (or `layout/`) and list it below.
7. Every screen uses `ScreenLayout` — see `doc/screen-layout-system.md`.

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
| `ScreenShell` | Header + padded scroll + footer (composes `ScreenLayout`) |
| `ScreenLayout` | **Required** outer wrapper — `src/components/layout` — see `doc/screen-layout-system.md` |
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

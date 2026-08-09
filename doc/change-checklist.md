# Change & feature gate (mandatory)

**Cursor rule:** `.cursor/rules/ui-reuse-gate.mdc` (`alwaysApply: true`)

Before writing or changing any screen, component, or feature UI, complete this gate. Skipping it is a rule violation.

## Step 1 — Read the docs

Open and use:

1. `doc/README.md` (index)
2. `doc/reusable-ui.md` (kit inventory + leave-feature-specific list)
3. `doc/screen-layout-system.md` (every screen → `ScreenLayout`)
4. `doc/design-tokens.md` (no ad-hoc colors/spacing)
5. Any domain doc that applies (`architecture`, `ui-data-separation`, `feature-constants`, …)

If the request conflicts with these docs, implement the **compliant** version and briefly say so.

## Step 2 — Search before inventing

Search the repo for an existing solution:

| Look in | For |
|---------|-----|
| `src/components/ui/` + `doc/reusable-ui.md` inventory | Buttons, chips, empty states, dialogs, headers, tabs, fields, banners |
| `src/components/layout/` | `ScreenLayout`, backgrounds |
| `src/components/` and `src/features/**` | Near-duplicate UI already in a screen (not yet extracted) |
| `src/hooks/`, `src/constants/`, `src/utils/` | Shared logic / knobs |

**Do not** paste a new `Pressable`/`Text`/`View` cluster that matches kit visuals.

## Step 3 — Decide (strict)

| Situation | Action |
|-----------|--------|
| Kit component exists and fits | **Use it** (import from `src/components/ui` or `layout`) |
| Kit component almost fits | **Extend it** (new props / variant) — do not fork markup into the screen |
| Same UI exists in ≥2 places (or clearly will) but is not in the kit | **Extract** into `src/components/ui/` (or `layout/`), export from `index.ts`, update `doc/reusable-ui.md`, then use it |
| Pattern appears once and is listed under “Leave feature-specific” | Keep local |
| Pattern appears once but is generic (chip row, empty state, dialog shell, section header, tab bar, form field chrome) | **Still extract** into the kit — do not wait for a second copy |
| New full screen | Wrap in `ScreenLayout` + `useScreenBackgrounds()`; compose kit pieces; no DIY `SafeAreaView` + canvas fill |

## Step 4 — Ship checklist

- [ ] Docs read for this change
- [ ] Inventory checked; no duplicate of an existing kit piece
- [ ] New shared UI exported + listed in `doc/reusable-ui.md`
- [ ] Tokens via `useAnthraTheme()` only
- [ ] Screen uses `ScreenLayout` (not a hand-rolled safe-area shell)
- [ ] No DB / repository / native bridge calls inside `src/components/ui/*` or `layout/*`
- [ ] Feature limits/defaults in `src/constants/<domain>.ts` when applicable
- [ ] Focus, loading, error, and disabled states do not change control geometry
- [ ] Long labels reflow or stack at large text sizes instead of silently shrinking
- [ ] Haptics are semantic and are not fired twice by a shared control and its caller

## Forbidden

- Copy-pasting chip rows, empty states, modal shells, tab bars, or section headers into a screen when a kit component exists or should be extracted
- Adding a second near-identical private helper next to an existing kit component
- Putting background/safe-area/StatusBar setup on the screen instead of `ScreenLayout`
- Hardcoding palette hex / ad-hoc typography instead of design tokens
- Treating “ship fast” as a reason to skip this gate — docs override that impulse

## Audited specialized exceptions

- Raw `Pressable` remains inside `AnimatedPressable` and `FormDialog` only, where it implements the shared primitive and modal backdrop/event boundary.
- The workout timer, compact chart axes/heatmaps, hub wordmark, and fixed-size share/export cards may use purpose-built type sizing or fitting; their geometry is intrinsic to the visualization/artwork.
- Reminder and tracker month grids remain feature-specific data visualizations while their surrounding actions, fields, sheets, and selection controls use the kit.
- Native Android notification payload colors remain fixed platform configuration values; application UI colors continue to come from the theme.

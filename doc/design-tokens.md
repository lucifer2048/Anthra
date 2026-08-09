# Design tokens

**Source:** `src/design-system/tokens.ts` + `theme.tsx`  
**Consume via:** `useAnthraTheme()` from `src/design-system`

## Rules

1. Use semantic color roles (`brand`, `textPrimary`, `surface`, …) — never invent new hex values in UI.
2. Use `theme.spacing.*`, `theme.sizes.*`, `theme.borderWidths.*`, `theme.radii.*`, `theme.typography.*`, `theme.layout.*`, `theme.motion.*`, and `theme.shadows.*`.
3. Typography stays on token sizes; do not scale fonts per page with ad-hoc `fontSize` except rare domain visualizations (charts) which must still use theme colors.
4. Touch targets: prefer `theme.layout.minTouchTarget` (48) or `compactTouchTarget` (44).
5. Content width: wrap scroll/body with `maxWidth: theme.layout.contentMaxWidth` and horizontal `theme.layout.screenPadding` unless a full-bleed surface (timer focus, share cards).

## Adding tokens

Add new roles to both `lightColors` and `darkColors` in `tokens.ts`, then use them through the theme. Do not add one-off colors in a single screen.

## Scales

- Spacing is a strict 4-point grid: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Controls use `44`, `48`, or `56`; icons use `16`, `18`, `20`, `24`, or `32`.
- Borders use `hairline`, `standard`, or `focused`.
- Normal UI type uses the semantic `display` through `caption` styles, plus `eyebrow` and tabular-number `metric`. Specialized timer heroes and fixed export/chart artwork are documented exceptions.
- Press/release/sheet springs and pressed scales live under `theme.motion`; reduced-motion-aware components bypass decorative movement.
- Elevation uses `theme.shadows.none|low|medium|overlay`. Dark-mode shadows are intentionally restrained and must be paired with semantic borders or surface differences.

## Intentional typography exceptions

- `TimerScreen` keeps its large countdown/phase hero type because legibility at a glance is part of the workout experience; surrounding labels and controls use semantic tokens.
- Fixed-size workout/activity export artwork and chart axes retain purpose-built dimensions and type, while using semantic theme colors where the output format permits.

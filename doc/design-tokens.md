# Design tokens

**Source:** `src/design-system/tokens.ts` + `theme.tsx`  
**Consume via:** `useAnthraTheme()` from `src/design-system`

## Rules

1. Use semantic color roles (`brand`, `textPrimary`, `surface`, …) — never invent new hex values in UI.
2. Use `theme.spacing.*`, `theme.radii.*`, `theme.typography.*`, `theme.layout.*`, `theme.motion.*`.
3. Typography stays on token sizes; do not scale fonts per page with ad-hoc `fontSize` except rare domain visualizations (charts) which must still use theme colors.
4. Touch targets: prefer `theme.layout.minTouchTarget` (48) or `compactTouchTarget` (44).
5. Content width: wrap scroll/body with `maxWidth: theme.layout.contentMaxWidth` and horizontal `theme.layout.screenPadding` unless a full-bleed surface (timer focus, share cards).

## Adding tokens

Add new roles to both `lightColors` and `darkColors` in `tokens.ts`, then use them through the theme. Do not add one-off colors in a single screen.

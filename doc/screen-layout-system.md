# Screen layout system

**Source:** `src/components/layout/ScreenLayout.tsx`  
**Backgrounds:** `src/design-system/backgrounds.ts` via `useScreenBackgrounds()`  
**Cursor rule:** `.cursor/rules/screen-layout.mdc`

## Why it exists

- Backgrounds fill the **whole screen** (behind status bar / home indicator)
- Content respects **safe areas**
- Screens must not invent their own `SafeAreaView` + background + `StatusBar` setup

## Structure

```
ScreenLayout
 ├── BackgroundLayer   (full screen: color / gradient / image / circle)
 └── SafeAreaView      (content only)
      └── your screen UI
```

## Mandatory rule

**Every screen** (module root UI) uses `ScreenLayout`.  
Do **not** put `backgroundColor` / gradients on `SafeAreaView` yourself.  
Prefer spreading tokens from `useScreenBackgrounds()`.

Modals / dialogs use `FormDialog` / `SheetDialog` (or a modal-local shell), not `ScreenLayout`.

## Typical usage

```tsx
import { ScreenLayout, useScreenBackgrounds } from "../components/layout";

export function AlarmBuddyScreen({ onBack }: Props) {
  const backgrounds = useScreenBackgrounds();

  return (
    <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
      {/* header + scroll content */}
    </ScreenLayout>
  );
}
```

Hub with brand wash:

```tsx
<ScreenLayout {...backgrounds.brandWash} safeAreaEdges={["top", "left", "right"]}>
  <HomeContent />
</ScreenLayout>
```

Tab bar owns the bottom inset (Tracker):

```tsx
<ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "left", "right"]}>
  <ScrollContent />
  <TrackerTabBar ... />  {/* safeArea on the tab bar */}
</ScreenLayout>
```

Edge-to-edge under status bar (drop top):

```tsx
<ScreenLayout {...backgrounds.canvas} safeAreaEdges={["left", "right", "bottom"]}>
  <CoverHero />
</ScreenLayout>
```

Different safe-area color than the full-screen background:

```tsx
<ScreenLayout {...backgrounds.canvas} safeAreaColor={theme.colors.surface}>
  <WebViewHost />
</ScreenLayout>
```

## Key props

| Prop | Purpose |
|------|---------|
| `color` / `gradient` / `image` / `withBgCircle` | Passed to `BackgroundLayer` |
| `safeAreaEdges` | Which edges get inset padding. Default: all four |
| `safeAreaColor` | Solid color on the safe-area wrapper (default transparent) |
| `safeAreaEdgeColors` | Per-edge band colors (optional) |
| `rootTopBannerVisible` | Drops top safe edge when a root banner is showing (avoids double gap) |
| `statusBarStyle` | Override; defaults to theme |

## Background tokens

`useScreenBackgrounds()` returns theme-aware tokens:

| Token | Use |
|-------|-----|
| `canvas` | Default app screens |
| `surface` | Rare elevated full-screen |
| `brandWash` | Hub / soft brand gradient + circle |

Add new tokens in `createScreenBackgrounds()` — do not hardcode fills in screens.

## Relation to ScreenShell

- `ScreenLayout` = outer chrome (background + safe area + status bar)
- `ScreenShell` = optional inner composition (header + padded scroll + footer)

`ScreenShell` must render **inside** `ScreenLayout` (or compose `ScreenLayout` itself). It must not mount its own competing `SafeAreaView` background.

## App shell

Anthra switches modules in `App.tsx` (no Expo Router stack). Module roots still use `ScreenLayout`. Keep any parent wrapper background transparent so the layout background can go edge-to-edge.

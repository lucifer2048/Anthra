# App providers

**Source:** `src/providers/AppProviders.tsx`

Root entry (`App.tsx`) wraps the tree in `AppProviders`. Screens still use `ScreenLayout` for safe-area content padding.

## Tree (outer → inner)

1. `GestureHandlerRootView` — RN gesture handler root
2. `SafeAreaProvider` — inset metrics only (not padding)
3. `ThemeProvider` — semantic theme + NativeWind dark sync

## Adding providers

Put new **app-wide** providers inside `AppProviders` (e.g. `QueryClientProvider` only if remote/React Query is introduced). Prefer:

```tsx
<GestureHandlerRootView>
  <SafeAreaProvider>
    <ThemeProvider>
      {/* QueryClientProvider here if needed */}
      {children}
    </ThemeProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

## Do not put here

- `SafeAreaView` / canvas background — use `ScreenLayout` per screen (`doc/screen-layout-system.md`)
- Feature repositories or DB init side effects — keep in app bootstrap / feature code

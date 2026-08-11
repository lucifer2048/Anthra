# App providers

**Source:** `src/providers/AppProviders.tsx`

Root entry (`App.tsx`) wraps the tree in `AppProviders`. Screens still use `ScreenLayout` for safe-area content padding.

`App.tsx` passes `localDataReady={ready}` after local SQLite bootstrap completes so account/social work does not race DB init.

## Tree (outer → inner)

1. `GestureHandlerRootView` — RN gesture handler root
2. `SafeAreaProvider` — inset metrics only (not padding)
3. `AccountProvider` — optional cloud session; when Supabase env is unset, `cloudAvailable` is false and the app remains a local guest (`src/features/account`)
4. `SocialProvider` — account-scoped stale-while-revalidate friends/leaderboard cache; no-ops without a session (`src/features/social/SocialProvider.tsx`)
5. `ThemeProvider` — semantic theme + NativeWind dark sync

`SocialProvider` must nest **inside** `AccountProvider` because it calls `useAccount()`.

## Adding providers

Put new **app-wide** providers inside `AppProviders`. Prefer:

```tsx
<GestureHandlerRootView>
  <SafeAreaProvider>
    <AccountProvider localDataReady={localDataReady}>
      <SocialProvider localDataReady={localDataReady}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </SocialProvider>
    </AccountProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

Add a remote `QueryClientProvider` only if a shared React Query layer is introduced; today social caching is custom inside `SocialProvider`.

## Do not put here

- `SafeAreaView` / canvas background — use `ScreenLayout` per screen (`doc/screen-layout-system.md`)
- Feature repositories or DB init side effects — keep in app bootstrap / feature code
- Module-specific UI state (active buddy, timer session)

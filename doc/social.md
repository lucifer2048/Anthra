# Friends & leaderboards

**Code:** `src/features/social/`  
**Screen:** `FriendsScreen` (`activeModule === "friends"`, optional initial tab `friends | leaderboard`)  
**Provider:** `SocialProvider` (inside `AccountProvider`)

## Role

Authenticated social layer for friends, requests, privacy toggles, and leaderboards. Requires a Supabase session. Guests and unconfigured builds simply do not expose cloud social data.

## Privacy defaults

Users opt in per metric:

- Share steps
- Share workout streak
- Share workout count
- Appear in leaderboards
- Share / receive friend activity notifications

Nutrition is never part of social stats or leaderboards.

## Caching

`SocialProvider` keeps a stale-while-revalidate snapshot (`SOCIAL_CACHE_FRESH_MS` = 60s) with a SQLite-backed cache repository. Refresh on focus/foreground; force refresh from the Friends UI. Cache is account-scoped and cleared on user change.

Hub can derive compact leaderboard positions via `homeLeaderboard.ts` without owning social network calls.

## Friend activity push

Optional Expo push tokens register through `friendActivityNotifications.ts` when the user opts in. Server: Edge Function `notify-friend-activity` after migration `007` (see `supabase/README.md`). Needs `EXPO_PUBLIC_EAS_PROJECT_ID` on the mobile build to obtain tokens.

## UI kit

Social lists use shared `PersonRow`, `SegmentedControl`, `EmptyState`, skeletons, and `SwitchRow` privacy rows. Prefer kit pieces over new list-row chrome.

## Related

- Account / auth: [account.md](./account.md)
- SQL migrations 001–005, 007: [`supabase/README.md`](../supabase/README.md)

# Feature constants

Feature knobs (limits, defaults, labels tied to product rules) live in:

```
src/constants/<domain>.ts
```

Examples already in tree: `schedule.ts`, `listBuddy.ts`, `notifications.ts`.

## Rules

1. Do not inline magic numbers for product limits in hooks or UI (e.g. max lists, max push-ups, retention days) — put them in constants.
2. Shared schedule day options stay in `src/constants/schedule.ts` (`WEEKDAY_OPTIONS`, `normalizeDays`, …).
3. UI kit components may accept those constants as props; they should not redefine weekday order or product limits.

## Documented exceptions (feature-local)

These knobs stay next to their feature modules for now (cloud/privacy coupling or analyzer validation). Prefer migrating into `src/constants/` when a second consumer appears:

| Domain | Location | Examples |
|--------|----------|----------|
| Nutrition analysis | `src/features/nutrition/nutritionAnalysisValidation.ts` | `MAX_ANALYSIS_IMAGE_BYTES` (1.5 MB), allowed MIME types |
| Account profile | `src/features/account/profileService.ts` | Avatar bucket, 512px resize, 1 MB upload cap; display name ≤80; handle `3–24` `[a-z0-9_]` |
| Social cache | `src/features/social/SocialProvider.tsx` | `SOCIAL_CACHE_FRESH_MS` (60s) |
| Social avatars | `src/features/social/socialService.ts` | Signed URL TTL / cache safety window |

Server-side nutrition quotas and provider secrets are Edge Function env vars — see [nutrition.md](./nutrition.md) — not mobile `src/constants/`.

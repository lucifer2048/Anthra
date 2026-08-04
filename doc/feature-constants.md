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

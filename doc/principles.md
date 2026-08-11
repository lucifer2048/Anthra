# Core principles

## Offline-first, local source of truth

Anthra keeps **local SQLite (`anthra.db`) as the source of truth** for app data on the device. Guest / local-only use must keep working when cloud env vars are unset.

Optional authenticated cloud (Supabase) may exist for account, friends/leaderboards, and private nutrition sync. Cloud is additive:

- Writes land locally first; sync queues and retries are idempotent where implemented.
- Builds without `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` stay fully local (guest).
- Do not require a network round-trip for core buddy flows (plans, reminders, lists, vault unlock, alarms, activity sensors).

## Privacy defaults

- Do **not** add analytics SDKs, advertising IDs, or crash reporters that upload PII.
- Password Buddy (vault) secrets stay in Secure Store / local vault tables and are **excluded from JSON backups** and from legacy cloud import until a password-encrypted export exists.
- Alarm camera frames are processed on-device and are never saved or uploaded.
- Nutrition meal details and photos are private to the account; they are never published to friends, leaderboards, or social stats.
- Friend/leaderboard stats are opt-in privacy flags owned by the signed-in user.

## Docs override assumptions

Before coding, read the relevant files under `doc/`. If a user request conflicts with these docs (e.g. invents a one-off button instead of using `Button` from the UI kit), implement the **compliant** version and briefly note the conflict.

## Type safety

- No `any` in app code.
- Avoid `unknown` at public boundaries unless narrowed immediately.
- Prefer explicit props types for shared components.

## Tokens only

Colors, spacing, radius, typography, and layout metrics come from `src/design-system/` via `useAnthraTheme()`. Do not hardcode palette hex values in screens or components (legacy NativeWind classNames that reference theme via runtime styles are fine when they use token values).

## Domain-shaped code

Group by feature under `src/features/<domain>/` when extracting from `App.tsx` or large screens. Shared presentational pieces live in `src/components/ui/`. DB access stays in `src/db/` or feature repositories — not inside presentational components.

## Single sources of truth

| Concern | Home |
|---------|------|
| Semantic theme | `src/design-system/` |
| Shared UI | `src/components/ui/` |
| Screen chrome | `src/components/layout/` (`ScreenLayout`) |
| Feature limits / knobs | Prefer `src/constants/<domain>.ts`; see [feature-constants.md](./feature-constants.md) for feature-local exceptions |
| Persistence | `src/db/` + feature repositories |
| Optional cloud client | `src/services/supabaseClient.ts` (null when unconfigured) |
| Native bridges | `src/utils/*Native.ts` / `src/features/*/…Native.ts` |

Before any UI or feature change: follow `doc/change-checklist.md` (search kit → reuse or extract → implement).

## Additive change discipline

When renaming shared UI exports, keep a re-export alias until all call sites migrate. Prefer extending props over breaking renames.

# Core principles

## Offline-first privacy

Anthra stores all user data on-device (SQLite + Secure Store). Do not add network APIs, analytics SDKs, crash reporters that upload PII, or cloud sync unless the product owner explicitly requests it and docs are updated first.

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
| Feature limits / knobs | `src/constants/<domain>.ts` |
| Persistence | `src/db/` + feature repositories |
| Native bridges | `src/utils/*Native.ts` / `src/features/*/…Native.ts` |

## Additive change discipline

When renaming shared UI exports, keep a re-export alias until all call sites migrate. Prefer extending props over breaking renames.

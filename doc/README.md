# Anthra docs

Source of truth for how this app is built. Cursor rules in `.cursor/rules/` are short and binding; they point here and say **follow the doc**.

**Pattern:** docs first → rules enforce → if a request conflicts with these docs, implement the compliant version and explain the conflict briefly.

## Index

| Doc | Covers |
|-----|--------|
| [app-shell-extraction.md](./app-shell-extraction.md) | Phased app-shell extraction tracker (Expo Router, hooks, Vault, Alarm, …) |
| [app-providers.md](./app-providers.md) | Root provider tree (`AppProviders`: Account → Social → Theme) |
| [change-checklist.md](./change-checklist.md) | **Mandatory gate** — docs + kit search before every UI/feature change |
| [principles.md](./principles.md) | Offline-first local SoT, optional cloud, privacy, type safety |
| [architecture.md](./architecture.md) | Modules, data layer, optional Supabase, native bridges |
| [native-modules.md](./native-modules.md) | Alarm Buddy / Activity Buddy local Expo modules (Android + iOS) |
| [account.md](./account.md) | Optional auth, onboarding gate, profile, legacy import |
| [social.md](./social.md) | Friends, privacy, leaderboards, activity push |
| [nutrition.md](./nutrition.md) | Local nutrition DB, sync queue, analysis Edge Function, catalogue gap |
| [screen-layout-system.md](./screen-layout-system.md) | ScreenLayout, safe areas, edge-to-edge backgrounds |
| [reusable-ui.md](./reusable-ui.md) | UI kit inventory, when to reuse vs invent, migration plan |
| [design-tokens.md](./design-tokens.md) | Colors, spacing, radius, typography, layout tokens |
| [hooks.md](./hooks.md) | Rules of Hooks, where hooks live |
| [feature-constants.md](./feature-constants.md) | Feature knobs in `src/constants/` (+ documented exceptions) |
| [performance.md](./performance.md) | Lists, JS thread, deferred work |
| [ui-data-separation.md](./ui-data-separation.md) | Presentational UI vs repositories / DB |

Operator cloud setup: [`../supabase/README.md`](../supabase/README.md).

Start with [principles.md](./principles.md) and [reusable-ui.md](./reusable-ui.md) before UI work.

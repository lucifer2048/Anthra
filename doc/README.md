# Anthra docs

Source of truth for how this app is built. Cursor rules in `.cursor/rules/` are short and binding; they point here and say **follow the doc**.

**Pattern:** docs first → rules enforce → if a request conflicts with these docs, implement the compliant version and explain the conflict briefly.

## Index

| Doc | Covers |
|-----|--------|
| [app-shell-extraction.md](./app-shell-extraction.md) | Phased App.tsx extraction tracker (Vault, helpers, …) |
| [app-providers.md](./app-providers.md) | Root provider tree (`AppProviders`) |
| [change-checklist.md](./change-checklist.md) | **Mandatory gate** — docs + kit search before every UI/feature change |
| [principles.md](./principles.md) | Ethics, offline-first, type safety, when docs override the user |
| [architecture.md](./architecture.md) | Modules, data layer, native bridges, navigation model |
| [screen-layout-system.md](./screen-layout-system.md) | ScreenLayout, safe areas, edge-to-edge backgrounds |
| [reusable-ui.md](./reusable-ui.md) | UI kit inventory, when to reuse vs invent, migration plan |
| [design-tokens.md](./design-tokens.md) | Colors, spacing, radius, typography, layout tokens |
| [hooks.md](./hooks.md) | Rules of Hooks, where hooks live |
| [feature-constants.md](./feature-constants.md) | Feature knobs in `src/constants/` |
| [performance.md](./performance.md) | Lists, JS thread, deferred work |
| [ui-data-separation.md](./ui-data-separation.md) | Presentational UI vs repositories / DB |

Start with [principles.md](./principles.md) and [reusable-ui.md](./reusable-ui.md) before UI work.

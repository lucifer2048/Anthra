# UI ≠ data / business logic

## Presentational UI (`src/components/ui/` and dumb feature pieces)

May:

- Render props and theme tokens
- Call `onPress` / `onChange` callbacks
- Use local UI-only state (open, pressed, focused)

Must not:

- Import `src/db` or call repositories
- Schedule notifications, alarms, or native modules
- Shape / validate domain payloads beyond trivial display formatting
- Own persistence side effects

## Screens and feature containers

Own:

- Loading data via repositories / `src/db`
- Wiring native bridges
- Domain validation (or call validators in `src/utils` / feature folders)
- Composing UI kit components

## Repositories

Live next to the feature (`src/features/<domain>/*Repository.ts`) or in `src/db/`. Keep SQL and migrations out of `.tsx` files.

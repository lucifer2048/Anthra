# Hooks

## Rules of Hooks

Follow React Rules of Hooks. No conditional hook calls.

## Where hooks live

- Shared reusable hooks: `src/hooks/`
- Feature-only hooks: `src/features/<domain>/hooks/` (create when a second consumer appears; otherwise keep logic in the screen until then)

## Do not

- Put hooks inside plain utility modules that are also imported from non-React contexts
- Add new top-level `AppState.addEventListener` subscriptions in random screens — share one app-foreground / lifecycle hook if needed
- Duplicate notification or audio setup; extend existing helpers (`useAudioCues`, reminder notification task) instead

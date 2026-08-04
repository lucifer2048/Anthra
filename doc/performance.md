# Performance

## Lists

For long or unbounded lists (history, completions, many alarms/items), prefer virtualization (`FlatList` / `SectionList` / FlashList if added) over mapping hundreds of rows inside a `ScrollView`.

## JS thread

- Avoid heavy synchronous work on the JS thread during gestures and transitions.
- Defer non-critical post-navigation work with `InteractionManager.runAfterInteractions` (or equivalent) when it would jank the first paint.
- Keep share-card capture and large JSON backup/restore off the critical path; show loading affordances.

## Animations

Prefer Reanimated worklets for continuous animation. Respect `useReducedMotion()` where progress / decorative motion exists (see `ProgressBar`).

## Images / camera

Alarm challenge camera and pose detection stay in native code; do not reimplement pose math on the JS thread.

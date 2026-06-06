# 012 — Smooth navigation scroll transition

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

The navigation bar snaps abruptly between its transparent-on-hero state and its white-on-scroll state. There is no CSS transition on the background colour or border colour, so the change is jarring when the scroll threshold is crossed.

Add `transition-colors duration-300` to the navigation container `<div>` class list. This single change smooths the background and border colour changes that already happen reactively via the `showScrolledState` derived value.

## Acceptance criteria

- [ ] Scrolling past the hero threshold on the homepage produces a smooth background colour transition on the navigation bar (transparent → white).
- [ ] Scrolling back up produces the reverse transition (white → transparent).
- [ ] The transition duration is around 300ms — perceptible but not slow.
- [ ] The transition also applies to the nav border colour change.
- [ ] Nav item text colour transitions also appear smooth (they already use `transition-colors` individually — verify they still work correctly).

## Parent

docs/prd/frontend-design-polish.md — Module 12

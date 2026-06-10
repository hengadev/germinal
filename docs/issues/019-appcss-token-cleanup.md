# 019 — app.css token cleanup

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Remove unused and redundant token definitions from `app.css`. Two categories:

**Pixel-literal radius aliases**

`radius-5px`, `radius-9px`, and `radius-10px` duplicate values already expressed by semantic names (`radius-button`, `radius-input`, `radius-card-sm`). Remove all three. `radius-15px` has no semantic equivalent — rename it to `radius-card-inner: 15px`.

Before deleting, confirm with a codebase grep that no component file references `radius-5px`, `radius-9px`, `radius-10px`, or `radius-15px`. At the time this issue was written, zero component usages existed — but verify before acting.

**font-alt removal**

`--font-alt` (`"Courier"`, `"sans-serif"`) is defined in `:root` and registered in `@theme inline` but has zero usages in any component. Remove the `--font-alt` custom property from `:root` and its `--font-alt` entry from `@theme inline`. Courier is a system font — there is no Google Fonts `@import` to remove.

Confirm zero usages with a codebase grep before deleting.

This issue is independent of all other issues in this sprint and can be done in any order.

## Acceptance criteria

- [ ] `radius-5px`, `radius-9px`, `radius-10px` are removed from `app.css`
- [ ] `radius-15px` is removed and `radius-card-inner: 15px` is added in its place
- [ ] `--font-alt` is removed from both `:root` and `@theme inline`
- [ ] Codebase grep confirms zero remaining references to any of the removed token names
- [ ] App builds without warnings
- [ ] Border-radius on inputs, buttons, and cards is visually unchanged

## Parent

`docs/prd/design-system-architecture.md`

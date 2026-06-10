# 018 — Shadow consolidation

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Replace all 11 occurrences of generic Tailwind shadow utilities with the project's named shadow tokens, and add a mapping comment to `app.css` to prevent future drift.

Substitution map:

| Current | Replacement |
|---|---|
| `shadow-sm` | `shadow-mini` |
| `shadow-md` | `shadow-popover` |
| `shadow-lg` | `shadow-popover` |
| `shadow-xl` | `shadow-popover` |

Also add a short comment above the shadow token definitions in `app.css`:

```
/* Generic Tailwind shadows are not used — map: shadow-sm → shadow-mini, shadow-md/lg/xl → shadow-popover */
```

**PWAInstallPrompt special case:** this component uses `shadow-lg` alongside `dark:border-gray-*` and `dark:bg-gray-*` Tailwind gray-scale leakage. Clean all three in this issue — replace the shadow and migrate the gray-scale classes to the appropriate semantic tokens (`border-border-card`, `bg-background`).

This issue is independent of the dark-* migration issues and can be worked in any order.

## Acceptance criteria

- [ ] No `shadow-sm`, `shadow-md`, `shadow-lg`, or `shadow-xl` classes remain anywhere in `src/` (outside `app.css`)
- [ ] A mapping comment is present above the shadow token block in `app.css`
- [ ] `PWAInstallPrompt` has no `dark:border-gray-*` or `dark:bg-gray-*` classes remaining
- [ ] Toast renders with the same visual shadow as before
- [ ] Admin sidebar collapse button renders with the same shadow as before
- [ ] PWAInstallPrompt renders correctly in both light and dark mode

## Parent

`docs/prd/design-system-architecture.md`

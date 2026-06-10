# 017 — dark-* migration: shared lib components

**Type:** AFK
**Status:** open
**Blocked by:** 014 — Surface token definitions

## What to build

Migrate every numeric `dark-*` class usage in shared library components (`src/lib/`) to the correct semantic token. This includes shared UI primitives, form elements, bits-ui wrappers, Toast, PWAInstallPrompt, and any other components under `src/lib/` that are consumed by both public and admin surfaces.

Apply the same substitution map as issues 015 and 016:

| Current | Replacement |
|---|---|
| `bg-dark-50`, `hover:bg-dark-50` | `bg-surface`, `hover:bg-surface` |
| `bg-dark-100`, `hover:bg-dark-100/50` | `bg-surface-hover`, `hover:bg-surface-hover` |
| `text-dark-900` | `text-foreground` |
| `text-dark-700`, `text-dark-800` | `text-foreground-alt` |
| `text-dark-400`, `text-dark-500`, `text-dark-600` | `text-muted-foreground` |
| `text-dark-200`, `text-dark-300` | `text-muted-foreground` |
| `placeholder-dark-300` | `placeholder-muted-foreground` |
| `border-dark-50` | `border-border-input` |
| `border-dark-100` | `border-border-input-hover` |

**Do not migrate:** `dark-10`, `dark-40`, `dark-04`.

Migrate these last (after 015 and 016) — shared components feed both route trees, and it is easier to verify correctness once both trees are already on semantic tokens.

This issue is independent of 015 and 016 and can be worked in parallel once 014 is merged, but reviewing it after both 015 and 016 are merged is recommended.

## Acceptance criteria

- [ ] No `text-dark-[0-9]`, `bg-dark-[0-9]`, `border-dark-[0-9]`, or `placeholder-dark-[0-9]` classes remain in `src/lib/`
- [ ] `dark-10`, `dark-40`, `dark-04` usages are untouched
- [ ] Toast component renders with correct background and text colours on a public page
- [ ] Shared form inputs render with correct border and placeholder colours on both a public page (e.g. Contact or booking flow) and an admin page (e.g. Event form)
- [ ] No visual regression in any shared component compared to before the migration

## Parent

`docs/prd/design-system-architecture.md`

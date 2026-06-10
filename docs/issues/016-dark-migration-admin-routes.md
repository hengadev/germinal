# 016 — dark-* migration: admin routes

**Type:** AFK
**Status:** open
**Blocked by:** 014 — Surface token definitions

## What to build

Migrate every numeric `dark-*` class usage in the admin routes (`src/routes/(admin)/`) to the correct semantic token. This covers the admin sidebar, dashboard, analytics, Event management, Reservation management, Talent management, Staff management, and any other pages under the admin route group.

Apply the same substitution map as issue 015:

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

**Sidebar/nav convention:** active nav items should rest on `bg-surface-hover` (not `bg-surface`) so they read as selected against a `bg-background-alt` shell; the hover state on inactive items transitions to `bg-surface-active`.

**Do not migrate:** `dark-10`, `dark-40`, `dark-04`.

This issue is independent of 015 and 017 — it can be worked in parallel once 014 is merged.

## Acceptance criteria

- [ ] No `text-dark-[0-9]`, `bg-dark-[0-9]`, `border-dark-[0-9]`, or `placeholder-dark-[0-9]` classes remain in `src/routes/(admin)/`
- [ ] `dark-10`, `dark-40`, `dark-04` usages are untouched
- [ ] Admin sidebar renders with correct active-item and hover-item backgrounds
- [ ] A representative admin management page (e.g. Reservations list, Event form) renders with correct text and surface colours
- [ ] No visual regression in the admin UI compared to before the migration

## Parent

`docs/prd/design-system-architecture.md`

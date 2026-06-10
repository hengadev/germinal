# 015 — dark-* migration: public routes

**Type:** AFK
**Status:** open
**Blocked by:** 014 — Surface token definitions

## What to build

Migrate every numeric `dark-*` class usage in the public routes (`src/routes/(public)/`) to the correct semantic token. This covers the Events listing, Event detail, Spotlight, Talent listing, Talent detail, Tickets, About, Manifesto, FAQ, Contact, and any other pages under the public route group.

Apply this substitution map:

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

**Do not migrate:** `dark-10`, `dark-40`, `dark-04` — these are opacity tints used for shadows and overlays and must remain untouched.

There is no 1:1 mapping for every numeric value to a surface token — most `dark-400` through `dark-900` usages are text or border colours that map to the existing `foreground`, `foreground-alt`, `muted-foreground`, and `border-*` semantic tokens. Verify the intent of each usage before substituting rather than applying the map blindly.

## Acceptance criteria

- [ ] No `text-dark-[0-9]`, `bg-dark-[0-9]`, `border-dark-[0-9]`, or `placeholder-dark-[0-9]` classes remain in `src/routes/(public)/`
- [ ] `dark-10`, `dark-40`, `dark-04` usages are untouched
- [ ] Events listing page renders with correct surface backgrounds and text contrast (manual check in browser)
- [ ] Event detail page and Spotlight page render with correct colours
- [ ] Ticket page renders correctly (the dark header and QR block)
- [ ] No visual regression on any public page compared to before the migration

## Parent

`docs/prd/design-system-architecture.md`

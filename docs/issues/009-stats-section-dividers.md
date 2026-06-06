# 009 — Add vertical dividers to homepage stats section

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

The homepage stats section displays three large numbers (`30+`, `80+`, `5`) in a flat three-column grid with no visual separation. The numbers feel unanchored without containment. Add thin vertical border dividers between the columns to give the section visual structure.

The second and third stat columns get a `border-l border-dark-100` left border. The first column has no left border. No new elements are introduced — the border is applied directly to the existing column `<div>` elements.

## Acceptance criteria

- [ ] A thin vertical border appears between the first and second stat columns.
- [ ] A thin vertical border appears between the second and third stat columns.
- [ ] The first column has no left border.
- [ ] The borders use the `dark-100` token (consistent with other dividers on the page).
- [ ] The layout is not disrupted on mobile (if the grid collapses to a single column on small screens, borders should be removed or replaced with horizontal separators).

## Parent

docs/prd/frontend-design-polish.md — Module 6

# 005 — Standardise button shapes across public pages

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Three distinct button radii currently coexist across the public site with no design rationale: `rounded-full`, `rounded-lg`, and sharp/no radius. Establish a clear rule and apply it everywhere:

**Rule:**
- **Primary / CTA buttons** (page-level calls to action, form submit buttons, navigation CTAs): sharp corners (`rounded-none` or at most `rounded-sm`). Reinforces the editorial aesthetic.
- **Filter / tag chips** (category filters on events and talents pages, inquiry-type tags on the contact page): retain `rounded-full`. The pill shape is semantically meaningful for a selectable chip.

Locations that need updating:
- Homepage hero CTA ("View upcoming" / "View creations") — currently `rounded-full`, make sharp.
- Homepage "Reserve a seat" button — currently `rounded-lg`, make sharp.
- Homepage CTA section "Contact us" button — currently `rounded-full`, make sharp.
- Contact page submit button — currently `rounded-full`, make sharp.
- Ticket page action buttons (Google Calendar, Apple/Outlook, Print) — currently `rounded-lg`, make sharp.
- Load-more buttons on events and talents pages — currently `rounded-full`, make sharp.
- Spotlight / event detail booking CTA — audit and align.

Filter chips (category buttons, inquiry-type tags on contact) stay `rounded-full`.

## Acceptance criteria

- [ ] All primary / CTA buttons on public pages use no border-radius or `rounded-sm`.
- [ ] Category filter chips and inquiry-type tag buttons retain `rounded-full`.
- [ ] No `rounded-lg` class appears on `<button>` or `<a>` CTA elements in `src/routes/(public)`.
- [ ] Visual spot-check: homepage, events listing, contact, spotlight, and ticket pages all show consistent sharp CTA buttons.

## Parent

docs/prd/frontend-design-polish.md — Module 3

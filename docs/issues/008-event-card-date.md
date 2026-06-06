# 008 — Add date to EventCard

**Type:** AFK
**Status:** open
**Blocked by:** 006 — Replace gray-* with dark-scale tokens

## What to build

`EventCard` currently shows only the event title and location. A visitor cannot assess whether an event is relevant without clicking through to the detail page. Add the event start date as a third line below the location.

The `startDate` field is already available on the `EventWithMedia` type passed to the card. Format the date using the locale-aware approach already established elsewhere in the codebase (using `$locale` and `toLocaleDateString`). Use the same muted typographic style as the location line (`text-xs text-dark-400 uppercase tracking-widest`) to keep the card visually minimal.

## Acceptance criteria

- [ ] `EventCard` displays the formatted event start date below the location line.
- [ ] The date respects the active locale (French format when `$locale === 'fr'`, English format when `$locale === 'en'`).
- [ ] The date uses muted styling consistent with the location text — it does not compete visually with the title.
- [ ] The card layout is not disrupted on either mobile or desktop grid views.

## Parent

docs/prd/frontend-design-polish.md — Module 4

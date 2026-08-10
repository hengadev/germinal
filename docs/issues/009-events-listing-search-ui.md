# 009 — Events listing search UI

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add a search input to the Events listing page, wired to the backend's existing keyword-search query parameter (which already searches Event titles/descriptions in both languages). No new backend work is required. This is net-new Guest-facing UI: invoke the `impeccable` skill for the implementation so it matches the site's existing design decisions rather than being freehanded.

## Acceptance criteria

- [ ] Typing a keyword into the new search input filters the Events listing to matching Events, in both supported languages.
- [ ] Clearing the search returns to the full listing.
- [ ] Search plays correctly with the existing category filter and pagination/load-more behavior.
- [ ] The new UI was implemented using the `impeccable` skill and visually matches the rest of the site's design system.

## Parent

docs/prd/guest-booking-self-service.md

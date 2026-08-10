# 007 — Booking widget on regular Event pages

**Type:** HITL
**Status:** open
**Blocked by:** None

## What to build

Add the same session-selection and booking entry point already used on the Spotlight page to the regular Event detail page, so Guests can book any qualifying Event directly from its own page, not only the Spotlight. The booking entry point must only be shown when the Event is published **and** at least one of its Sessions has not yet started — a fully passed Event or an unpublished Event must show no booking affordance.

This is a user-facing, design-sensitive change: invoke the `impeccable` skill for the implementation so the result matches the site's existing design decisions rather than being freehanded. Because of the design-fidelity bar, this issue is HITL — flag it for a design/product review before merging.

## Acceptance criteria

- [ ] A published Event with at least one future Session shows a working booking entry point on its own page, leading to the same booking flow used from Spotlight.
- [ ] A published Event whose Sessions have all already started/ended shows no booking entry point.
- [ ] An unpublished Event shows no booking entry point (unchanged from today).
- [ ] The new UI was implemented using the `impeccable` skill and visually matches the rest of the site's design system.
- [ ] Manually verified on a published upcoming Event, a published fully-past Event, and an unpublished Event.

## Parent

docs/prd/guest-booking-self-service.md

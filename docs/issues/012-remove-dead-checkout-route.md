# 012 — Remove dead /checkout route

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Delete the abandoned custom checkout page and its associated client-side session-storage handoff code. The real booking flow already redirects Guests to Stripe's hosted Checkout page directly; this route is unreachable through normal navigation and reads a value that nothing in the app ever writes, so it can be removed outright.

## Acceptance criteria

- [ ] The dead route and its unused client-side handoff code are removed.
- [ ] The real booking flow (redirect to Stripe's hosted Checkout) is unaffected and still works end-to-end.
- [ ] No remaining references to the removed route exist anywhere in the app.

## Parent

docs/prd/guest-booking-self-service.md

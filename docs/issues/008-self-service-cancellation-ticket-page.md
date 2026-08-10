# 008 — Self-service cancellation entry point on Ticket page

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add a "cancel my Reservation" action to the Ticket page that calls the existing cancellation endpoint. The endpoint already enforces the 24-hour cancellation window and handles the Stripe refund and capacity restoration server-side — this issue is purely about giving Guests a UI path to it, including surfacing the eligibility outcome (why cancellation isn't allowed, if it isn't) and a confirmation of the refund once it succeeds. Use the `impeccable` skill for this UI so it's consistent with the rest of the site.

## Acceptance criteria

- [ ] A Guest viewing their Ticket within the cancellation window sees a working "cancel" action that, on confirmation, cancels the Reservation and shows a refund confirmation.
- [ ] A Guest viewing their Ticket outside the cancellation window (or for a Reservation that isn't eligible) sees a clear explanation instead of a broken or silently-failing action.
- [ ] No backend changes are needed beyond what already exists; the issue is scoped to the UI layer.

## Parent

docs/prd/guest-booking-self-service.md

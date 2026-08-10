# 025 — Stripe dispute/chargeback handling

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Handle the Stripe dispute-related webhook events (currently silently ignored) by recording the dispute against the relevant Payment and notifying an Admin, instead of the event being dropped with no visibility.

## Acceptance criteria

- [ ] A dispute-related Stripe webhook event results in a record of the dispute against the correct Payment/Reservation.
- [ ] An Admin is notified when a dispute is created.
- [ ] The dispute's lifecycle (e.g. updated or closed) is reflected in the stored record, not just its creation.

## Parent

docs/prd/notifications-reliability.md

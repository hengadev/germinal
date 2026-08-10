# 023 — Guest cancellation/refund notifications

**Type:** AFK
**Status:** open
**Blocked by:** 022 — Consolidate the two event-reminder implementations into one

## What to build

Send a notification (email, and SMS if the Guest opted in) whenever a Reservation is cancelled or refunded — covering the Guest-initiated self-service cancellation, an Admin-initiated cancellation, an Admin-initiated refund, and a refund arriving via the Stripe webhook. Today none of these paths notify the Guest at all. Use the existing notification infrastructure and follow the same pattern as the existing Ticket-confirmation notification. Sequenced after the reminder-system consolidation so this isn't layered on top of two competing reminder implementations.

## Acceptance criteria

- [ ] A Guest who cancels their own Reservation receives a cancellation/refund confirmation notification.
- [ ] A Guest whose Reservation is cancelled or refunded by an Admin receives the same notification.
- [ ] A Guest whose refund arrives via the Stripe webhook (e.g. a dispute-driven or manually-issued-in-Stripe refund) also receives the notification.
- [ ] SMS is sent in addition to email only for Guests who opted in to SMS notifications, consistent with how other SMS notifications in the app already respect that preference.

## Parent

docs/prd/notifications-reliability.md

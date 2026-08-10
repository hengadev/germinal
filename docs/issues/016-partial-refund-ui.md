# 016 — Partial refund UI

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Extend the existing refund action on the Reservation detail page to accept a specific amount rather than always refunding the full remaining balance, reusing the existing Stripe refund and payment-status update logic (which already supports a partial amount and a "partially refunded" status at the schema level — only the UI is missing).

## Acceptance criteria

- [ ] An Admin can enter a partial amount and issue a refund for exactly that amount.
- [ ] Attempting to refund more than the remaining refundable balance is rejected with a clear error.
- [ ] The Reservation/Payment status correctly reflects "partially refunded" vs "refunded" depending on whether the full balance was refunded.
- [ ] The existing full-refund flow continues to work unchanged when no partial amount is specified.

## Parent

docs/prd/admin-back-office-improvements.md

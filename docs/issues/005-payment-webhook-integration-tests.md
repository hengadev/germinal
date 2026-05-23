# 005 — Payment Webhook Integration Tests

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Integration tests for the Stripe webhook handlers: `handlePaymentSuccess` and `handlePaymentFailure`. These functions confirm or fail a Reservation based on Stripe events — a bug here means Guests pay but never receive a confirmed Reservation, or failed payments are incorrectly confirmed.

Tests run against the `germinal_test` database using the existing fixtures. AWS SES calls are mocked. Each test seeds a pending Reservation with a Payment row (holding a fake `stripePaymentIntentId`), constructs a minimal Stripe event object, calls the handler, and asserts on the resulting database state.

**`handlePaymentSuccess` cases:**
- **Happy path** — Reservation status becomes `confirmed`, `confirmedAt` is set, Payment status becomes `succeeded`, `webhookProcessedAt` is set, and the ticket confirmation email function is called with the correct Guest email and access token.
- **Idempotency** — calling the handler twice with the same PaymentIntent leaves the Reservation and Payment unchanged after the second call (no duplicate email sent).
- **Unknown PaymentIntent** — handler returns without error and does not modify any row.

**`handlePaymentFailure` cases:**
- **Happy path** — Payment status becomes `failed`, `lastError` is populated from the event's `last_payment_error.message`.
- **Unknown PaymentIntent** — handler returns without error.

## Acceptance criteria

- [ ] All five cases have passing tests
- [ ] The idempotency test asserts the ticket email mock is called exactly once across two handler invocations
- [ ] No real SES calls are made during the test run
- [ ] Tests run with `pnpm test` without requiring a running application server
- [ ] Each test cleans up via `setupTestDatabase()` before running

## Parent

docs/prd/pre-launch-readiness.md

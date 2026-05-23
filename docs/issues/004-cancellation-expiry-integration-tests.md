# 004 — Cancellation & Expiry Integration Tests

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Integration tests for the two capacity-restoration paths: `cancelReservationWithRefund` and `expireReservation`. These are the functions that return seats to a Session when a Guest cancels or a pending Reservation times out — a bug here causes permanent capacity loss.

Tests run against the `germinal_test` database using the existing fixtures. Stripe refund calls are mocked. Each test seeds a confirmed (or pending) Reservation with an associated Payment, calls the function under test, and asserts on the resulting database state.

**`cancelReservationWithRefund` cases:**
- **Happy path** — Reservation status becomes `cancelled`, Payment status becomes `refunded`, `availableCapacity` on the Session is restored by `quantity`.
- **Non-confirmed Reservation** — throws when Reservation status is not `confirmed`; capacity is unchanged.
- **Missing Payment record** — throws when no Payment row exists for the Reservation.

**`expireReservation` cases:**
- **Happy path** — Reservation status becomes `expired`, `availableCapacity` on the Session is restored by `quantity`.
- **Idempotency** — calling `expireReservation` twice on the same Reservation does not double-restore capacity.
- **Already expired** — calling on a Reservation with status `expired` completes without error and leaves capacity unchanged.

## Acceptance criteria

- [ ] All six cases have passing tests
- [ ] The idempotency test asserts that `availableCapacity` after two calls equals `availableCapacity` after one call
- [ ] No real Stripe calls are made during the test run
- [ ] Tests run with `pnpm test` without requiring a running application server
- [ ] Each test cleans up via `setupTestDatabase()` before running

## Parent

docs/prd/pre-launch-readiness.md

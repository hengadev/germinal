# 003 — createReservation Integration Tests

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Integration tests for the `createReservation` service function — the entry point for the booking flow and the highest-risk code in the application. Tests run against the `germinal_test` PostgreSQL database using the existing `getTestDatabase()` / `setupTestDatabase()` fixtures.

Stripe calls are mocked at the service boundary (no real HTTP calls). AWS SES calls are mocked (verify the ticket email function is called with correct arguments, not that it sends).

Each test seeds the minimum required database state (an Event with a published Session), calls `createReservation`, and asserts on the resulting database rows and return value.

**Cases to cover:**

- **Happy path** — capacity is decremented by `quantity`, a Reservation row is created with status `pending`, a Payment row is created linked to the Reservation, and `clientSecret` is returned.
- **Sold out** — throws when `availableCapacity < quantity`; capacity is unchanged after the call.
- **Race condition** — two concurrent calls each requesting the full remaining capacity; exactly one succeeds and one throws; capacity in the database is never negative after both settle.
- **Session not published** — throws when the Session's `published` flag is false.
- **Session already started** — throws when `startTime` is in the past.
- **Honeypot filled** — throws when the honeypot field is non-empty.

## Acceptance criteria

- [ ] All six cases have passing tests
- [ ] The race condition test uses `Promise.all` with two concurrent calls and asserts capacity is non-negative and exactly one Reservation was created
- [ ] Tests run with `pnpm test` (Vitest) without requiring a running application server
- [ ] No real Stripe or SES calls are made during the test run
- [ ] Each test cleans up via `setupTestDatabase()` before running

## Parent

docs/prd/pre-launch-readiness.md

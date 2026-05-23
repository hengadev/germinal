# Pre-Launch Readiness

**Status:** Draft
**Date:** 2026-05-23

## Problem Statement

Germinal is a paid-ticket platform operating in France. Before going live with real reservations and payments, three gaps remain: guests have no legal basis for understanding how their data is used or what the terms of sale are; the ticket page has no printable/downloadable format despite users expecting one; and the highest-risk service code (reservation transactions, payment webhook handling) has no automated test coverage, making regressions undetectable.

## Solution

Three independent improvements ship together as a pre-launch milestone:

1. **Legal & Compliance Pages** — bilingual (FR/EN) static pages for the privacy policy, general terms of sale (CGV), and an FAQ, accessible from the public site footer.
2. **Printable Ticket** — the existing ticket page gains CSS print styles and a `window.print()` trigger so guests can save or print a clean PDF of their ticket without new server dependencies.
3. **Reservation & Payment Integration Tests** — the `reservations` and `payments` service modules gain a suite of integration tests against a real test database, covering the critical paths where overbooking, double-processing, and capacity bugs would hide.

## User Stories

1. As a Guest, I want to read Germinal's privacy policy before booking, so that I understand how my personal data is used.
2. As a Guest, I want to read the general terms of sale before completing my Reservation, so that I know the refund and cancellation conditions.
3. As a Guest, I want to read an FAQ, so that I can answer common questions without contacting Germinal.
4. As a Guest, I want to print or save my Ticket as a PDF, so that I have an offline copy to present at the event entrance.
5. As an Admin, I want the reservation transaction logic to have automated test coverage, so that capacity bugs and overbooking regressions are caught before they affect Guests.
6. As an Admin, I want the Stripe webhook handler to have automated test coverage, so that payment confirmation and failure flows are verifiable without triggering real payments.

## Implementation Decisions

### Module 1 — Legal & Compliance Pages

- Three new public routes: `/legal/privacy`, `/legal/terms`, `/faq`. The `/legal/` prefix groups the two legal documents; `/faq` stands alone at the top level as it is editorial rather than legal.
- No server-side load function needed — content is fully static.
- All content lives in `en.json` and `fr.json` under a `legal` and `faq` namespace. The pages render in the active locale, consistent with the rest of the site.
- A shared layout wrapper component handles the legal page chrome (narrow readable column, section headings, last-updated date).
- Company name: **Germinal**. Registered address: **TODO — must be filled before publishing**. Privacy contact email: `privacy@germinalstudio.co` (to be set up as a forwarding alias before go-live).
- The privacy policy covers: identity of the data controller, categories of personal data collected (name, email, phone for Reservations; IP address and user-agent for fraud prevention), legal basis (contractual necessity for Reservations, legitimate interest for fraud prevention), retention periods, Guest rights under RGPD, and the `privacy@germinalstudio.co` contact.
- The CGV (terms of sale) covers: offer and acceptance, pricing and currency (EUR), payment via Stripe, cancellation and refund policy aligned with the existing service behaviour (confirmed Reservations can be cancelled with full refund), Germinal's liability limits, and governing law (French law, Paris jurisdiction).
- The FAQ covers: how to retrieve a Ticket, what happens if a Session is sold out (Waitlist), how to cancel a Reservation, what the QR code is for, and how to contact Germinal.
- The footer of the public layout must link to all three pages.

### Module 2 — Printable Ticket

- A `@media print` stylesheet is added to the ticket page only (scoped, not global).
- Print styles: hide navigation, header, footer, calendar download button, and any promotional content; display the QR code at full width; show event title, Session date/time, venue, Guest name, quantity, and Reservation reference; use black-on-white only.
- The existing Print/Download button (already present in the ticket page UI with a `Printer` icon) is wired to `window.print()`.
- No server route, no new npm dependency, no PDF library.

### Module 3 — Reservation & Payment Integration Tests

- Tests run against the `germinal_test` PostgreSQL database using the existing `getTestDatabase()` / `setupTestDatabase()` fixtures (which truncate all relevant tables before each suite).
- The test runner is Vitest; the existing `vitest.config.ts` is used unchanged.
- Stripe calls are mocked at the service boundary — tests do not make real HTTP calls to Stripe.
- AWS SES calls (ticket confirmation email) are mocked — tests verify the email function is called with the right arguments, not that it sends.

**`createReservation` tests:**
- Happy path: capacity decremented, Reservation created with status `pending`, Payment record created.
- Sold-out: throws when `availableCapacity < quantity`.
- Race condition: two concurrent calls for the last seat — exactly one succeeds, the other throws; capacity never goes negative.
- Session not published: throws.
- Session already started: throws.
- Honeypot filled: throws.

**`cancelReservationWithRefund` tests:**
- Happy path: Reservation status → `cancelled`, Payment status → `refunded`, capacity restored.
- Non-confirmed Reservation: throws.
- Missing Payment record: throws.

**`expireReservation` tests:**
- Happy path: Reservation status → `expired`, capacity restored.
- Already expired: idempotent, no error.

**`handlePaymentSuccess` tests:**
- Happy path: Reservation status → `confirmed`, Payment `webhookProcessedAt` set, ticket email called.
- Idempotency: called twice with the same PaymentIntent — second call is a no-op.
- Unknown PaymentIntent: logs warning, no error thrown.

**`handlePaymentFailure` tests:**
- Happy path: Payment status → `failed`, `lastError` set.
- Unknown PaymentIntent: no error thrown.

## Testing Decisions

- Module 3 is the test module. Modules 1 and 2 require no automated tests — legal page content is verified by reading, and print styles are verified by browser inspection.
- Good tests for the reservation service hit a real database (no Drizzle mocking) — the existing codebase comment in `tests/fixtures/database.ts` reflects this intent.
- The race condition test uses `Promise.all` to fire two concurrent `createReservation` calls with `quantity = availableCapacity` on a freshly seeded Session.
- Prior art: `tests/fixtures/database.ts` (test DB setup), `tests/unit/validators/reservations.test.ts` (Vitest pattern to follow).

## Out of Scope

- Newsletter signup (deferred indefinitely).
- PDF generation via a server-side library or Playwright rendering (CSS print is sufficient).
- E2E Playwright test fixes (the broken booking-flow spec is not addressed here).
- Spotlight DB-level uniqueness enforcement (enforced at service layer; acceptable for now).
- User account registration flow.
- Admin-side legal page content management.

## Further Notes

- `privacy@germinalstudio.co` must be created as an email forwarding alias before the legal pages are published. This is a DNS/hosting task, not a code task.
- The TODO for the registered address in the legal page content must be resolved before go-live. The placeholder should be visually obvious in the rendered page (e.g. `[ADRESSE — À COMPLÉTER]`) so it cannot be accidentally published blank.
- The `CONTACT_EMAIL` env var is currently set to `hello@germinal.com` — a placeholder. The production value should be updated to the real address on `germinalstudio.co` before launch (separate from the privacy contact).

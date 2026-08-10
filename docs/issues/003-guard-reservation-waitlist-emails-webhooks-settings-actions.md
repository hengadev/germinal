# 003 — Guard Reservation/Waitlist/Emails/Webhooks/Settings admin actions

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add an Admin-role authorization check as the first step of every form action tied to Reservation management (cancel, refund, resend reminder), Waitlist bulk actions (notify, mark notified, delete, delete expired), the email-queue admin view (retry, delete, delete old), the stuck-payments/webhook retry action, and site settings updates. This is the most sensitive group functionally, since it includes issuing real Stripe refunds.

## Acceptance criteria

- [ ] Every action in this group rejects a request with no session and a request from a non-Admin session, before any side effect (including the Stripe refund call) occurs.
- [ ] An authenticated Admin session can still cancel/refund a Reservation, run Waitlist bulk actions, retry emails/webhooks, and update settings exactly as before.
- [ ] A regression test exists asserting the refund action specifically is rejected when unauthenticated, given it triggers a real financial transaction.

## Parent

docs/prd/access-control-hardening.md

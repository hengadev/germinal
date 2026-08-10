# 004 — Auth-gate the 4 CSV export endpoints

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Require an authenticated Admin session before generating output on each of the four CSV export endpoints (analytics, payments, waitlist, reservations). These currently have no authorization check at all and return full CSV data — including Guest names, emails, phone numbers, and payment details — to any request that reaches them.

## Acceptance criteria

- [ ] Each of the 4 export endpoints returns an authorization error (not CSV data) for a request with no session.
- [ ] Each of the 4 export endpoints returns an authorization error for a request from a non-Admin session.
- [ ] An authenticated Admin session can still download each export exactly as before.
- [ ] A regression test covers all 4 endpoints being rejected when unauthenticated.

## Parent

docs/prd/access-control-hardening.md

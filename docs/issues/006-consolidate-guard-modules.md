# 006 — Consolidate guard modules and remove unused middleware scaffolding

**Type:** AFK
**Status:** open
**Blocked by:** 001 — Guard Event/Session/Media/Promo-Code admin actions, 002 — Guard Talent/Team/Category admin actions, 003 — Guard Reservation/Waitlist/Emails/Webhooks/Settings admin actions, 004 — Auth-gate the 4 CSV export endpoints, 005 — Correct Staff/Admin boundary on team & task-management APIs

## What to build

Merge the two existing authorization-guard helper modules into a single canonical module with one consistent shape, and update every route that currently imports either of the old modules (including the routes touched by issues 001–005) to use the new one. Remove the unused composable middleware scaffolding (the auth/CSRF/rate-limit wrapper functions with no current call sites) so there is exactly one established pattern for enforcing authorization on a route going forward.

## Acceptance criteria

- [ ] Only one authorization-guard module exists in the codebase; the old duplicate is deleted.
- [ ] Every route previously using either guard module now uses the canonical one, with no behavior change (all existing tests, including the new regression tests from 001–005, continue to pass).
- [ ] The unused middleware scaffolding is deleted.
- [ ] Typecheck and the full test suite pass after the migration.

## Parent

docs/prd/access-control-hardening.md

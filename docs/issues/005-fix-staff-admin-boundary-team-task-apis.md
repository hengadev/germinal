# 005 — Correct Staff/Admin boundary on team & task-management APIs

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Change the authorization check on the team-management endpoints (create/deactivate/reset-password/generate-password for Staff accounts) and the Task/event-Staff assignment endpoints from the broader Staff-or-Admin check to an Admin-only check, matching the domain model where only Admins manage Staff and assign Tasks. Staff's own endpoints for viewing and updating the status of their own assigned Tasks are separate and already correctly scoped — they are not touched by this change. Also close the unused duplicate reservations-CSV-export endpoint (a leftover, unreferenced route separate from the one fixed in issue 004) which was still gated with the same overly-broad Staff-or-Admin check.

## Acceptance criteria

- [ ] An authenticated Staff-role session is rejected (not permitted) when calling any team-management endpoint (create/deactivate/reset-password/generate-password) or any Task/event-Staff assignment endpoint.
- [ ] An authenticated Admin-role session can still perform all of these actions exactly as before.
- [ ] Staff can still view and update the status of their own assigned Tasks through their existing, separately-scoped endpoints — unaffected by this change.
- [ ] The unused duplicate reservations-export endpoint also requires the Admin role, not Staff-or-Admin.
- [ ] A regression test asserts a Staff-role session is rejected on at least one team-management endpoint, one Task-management endpoint, and the duplicate export endpoint.

## Parent

docs/prd/access-control-hardening.md

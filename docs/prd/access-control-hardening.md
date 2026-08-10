# Access Control Hardening

**Status:** Draft
**Date:** 2026-08-10

## Problem Statement

Admin-only actions across the back office can currently be invoked without authentication. The admin layout's authorization check only runs for page rendering, not for form-action submissions or for standalone API route handlers — so anyone who can reach the admin host can trigger destructive actions (cancelling or refunding a Reservation, deleting an Event/Session/Talent, changing site settings) and can download unauthenticated CSV exports containing Guest PII and payment data. Separately, several Staff-facing APIs are gated by a check that also permits the Staff role for actions the domain model reserves for Admins (creating/deactivating Staff accounts, resetting another Staff member's password, assigning Staff to Events, managing Tasks) — letting an external contractor account escalate beyond the "minimal portal" access the role is meant to have.

## Solution

Add an explicit Admin-role authorization check to every admin form action and every admin export endpoint. Correct the Staff/Admin boundary on team- and task-management APIs so they require the Admin role. Consolidate the two divergent authorization-guard helpers currently in use into a single canonical module, and remove the unused middleware scaffolding that was built as an alternative approach and never adopted. Add regression tests asserting unauthenticated and wrong-role requests are rejected.

## User Stories

1. As an Admin, I want every destructive admin action (cancel, refund, delete, edit settings) to require an authenticated Admin session, so that no one outside the team can alter data or issue refunds.
2. As an Admin, I want the CSV export endpoints to require authentication, so that Guest and payment data isn't downloadable by anonymous visitors.
3. As an Admin, I want Staff (external contractors) to be unable to create or deactivate other Staff accounts or reset their passwords, so that contractor access stays scoped to their own assigned Tasks.
4. As a developer, I want a single canonical authorization-guard module, so that new routes can't accidentally use a more permissive check than intended.
5. As an Admin, I want automated tests that fail if an admin action or export endpoint becomes reachable without authentication, so this class of bug can't silently reappear.

## Implementation Decisions

- **Module A — Admin form-action guarding.** Every form action under the admin route group gets an Admin-role authorization check, applied consistently rather than ad hoc per action. Covers: Talent CRUD (list, detail, new), email queue management, Waitlist bulk actions, stuck-payment webhook retry, Event CRUD (list, new, detail — including its embedded Sessions/media/Promo Code/Team actions), the standalone Sessions management route, Reservation cancel/refund/reminder, site settings, and the Team page's Talent/category actions.
- **Module B — Export endpoint guarding.** The admin CSV export endpoints (analytics, payments, waitlist, reservations) require an authenticated Admin session before generating output.
- **Module C — Staff/Admin boundary correction.** Team-management endpoints (create/deactivate/reset-password/generate-password for Staff accounts) and Task/event-Staff assignment endpoints require the Admin role specifically, not the broader Staff-or-Admin check — aligning with the domain model where only Admins manage Staff and assign Tasks. Staff's own view of their assigned Tasks continues through its existing, separately-scoped endpoints and is unaffected by this change.
- **Module D — Guard consolidation.** The two existing authorization-guard modules (one keyed on the full request context, one keyed on the resolved session/user) are merged into a single module with one shape; every route importing the old modules is updated to the new one. The unused composable middleware scaffolding (auth/CSRF/rate-limit wrappers with no current call sites) is removed rather than left as dead code competing with the real guard module as "the way to do auth" in this codebase.
- No schema changes required for this PRD.

## Testing Decisions

- New tests assert: an unauthenticated request to each admin form action returns an authorization error rather than performing the action's side effect; an unauthenticated request to each export endpoint is rejected; an authenticated Staff-role session is rejected by the team-management and task-management endpoints that should be Admin-only, while an Admin-role session succeeds.
- Prior art: the existing Reservation/payment integration tests establish the pattern for exercising real service functions against a test database. This PRD's tests are lighter-weight (request/response or guard-function level), since the goal is verifying the authorization boundary itself, not business logic already covered elsewhere.
- Booking-widget and notification-dispatch tests are out of scope for this PRD (see the Guest Booking & Self-Service and Notifications & Reliability PRDs).

## Out of Scope

- Any new permission tiers beyond the existing Admin/Staff/Guest model (e.g. per-event Staff scoping, granular RBAC) — flagged as a possible future improvement, not required to close the current gap.
- Rate limiting additions beyond what already exists.
- Session/device management, 2FA — a separate concern, not required to fix the access-control gap.

## Further Notes

- This PRD should ship before the others — it addresses a live vulnerability, not a feature gap.
- The object-level scoping gap (any Staff account can currently modify Tasks/Team assignments on any Event, not just their own) is intentionally addressed by moving those endpoints to Admin-only rather than adding per-event ownership checks, since Staff aren't supposed to reach them at all per the domain model.

# 021 — Remove dead-redirect pages and de-duplicate Session CRUD

**Type:** AFK
**Status:** open
**Blocked by:** 016 — Partial refund UI, 017 — Manual/comp Reservation creation, 019 — Settings page expansion

## What to build

Remove the admin pages that do nothing but redirect elsewhere while stranding large blocks of unreachable, duplicated CRUD code behind them (the standalone category-management page superseded by the Events-tab version, the standalone talent-category page superseded by the Team-tab version, and the standalone Talent-list page superseded by the Team-tab version). Also collapse the two parallel implementations of Session CRUD (one embedded as an Event-detail tab, one as a standalone route) down to a single implementation. This is sequenced last in this PRD because it touches the same files that partial refunds, comp Reservations, and settings expansion are also changing.

## Acceptance criteria

- [ ] The redirect-only pages and their unreachable duplicate action code are deleted.
- [ ] Only one implementation of Session CRUD remains, and all existing Session-management functionality (create/update/delete, including badge assignment) still works through it.
- [ ] No admin navigation links point at a removed route.

## Parent

docs/prd/admin-back-office-improvements.md

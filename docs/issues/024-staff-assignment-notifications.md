# 024 — Staff assignment notifications

**Type:** AFK
**Status:** open
**Blocked by:** 022 — Consolidate the two event-reminder implementations into one

## What to build

Send a notification to a Staff member when they are assigned to an Event or given a new Task. Today Staff have no way to find out about a new assignment except by logging into the portal and checking. Use the existing notification infrastructure. Sequenced after the reminder-system consolidation for the same reason as issue 023.

## Acceptance criteria

- [ ] A Staff member assigned to an Event receives a notification about the assignment.
- [ ] A Staff member given a new Task receives a notification about it.
- [ ] Notifications use the existing email/SMS infrastructure and respect the same opt-in/contact-preference rules used elsewhere.

## Parent

docs/prd/notifications-reliability.md

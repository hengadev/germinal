# 020 — Basic audit log for destructive admin actions

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Record who performed a destructive or sensitive admin action and when — at minimum: Reservation cancellation, Reservation refund (full or partial), Event/Session/Talent deletion, and settings changes. Surface this as a simple chronological list somewhere in the admin UI; filtering/search is not required for this first version.

## Acceptance criteria

- [ ] Each of the listed action types creates an audit record capturing the acting Admin, the action taken, the affected entity, and a timestamp.
- [ ] The audit trail is viewable as a simple chronological list from the admin UI.
- [ ] Performing one of the tracked actions and then checking the log confirms the record appears correctly.

## Parent

docs/prd/admin-back-office-improvements.md

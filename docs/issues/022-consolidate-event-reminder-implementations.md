# 022 — Consolidate the two event-reminder implementations into one

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

There are currently two independent implementations of "send Event reminders to Guests" — a scheduled background job that runs automatically, and a separate HTTP-triggered version meant to be called by an external scheduler, with its own different time-window logic and its own different email template. Keep the scheduled background-job version as canonical (it runs automatically without depending on external configuration) and remove the other, including its HTTP endpoint and its divergent template.

## Acceptance criteria

- [ ] Only one event-reminder implementation remains in the codebase.
- [ ] The removed implementation's HTTP endpoint no longer exists.
- [ ] The remaining implementation's reminder timing and template are confirmed (manually) to match what was previously sent, or any intentional change in copy/timing is a deliberate decision, not an accidental side effect of the merge.
- [ ] Manual verification confirms no Guest receives a duplicate reminder because of the consolidation.

## Parent

docs/prd/notifications-reliability.md

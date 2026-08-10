# 002 — Guard Talent/Team/Category admin actions

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add an Admin-role authorization check as the first step of every form action tied to Talent and Team management — the Talent list, Talent detail, Talent creation, and the Team page's Talent-category actions. As with the Event actions, these currently execute without any check when submitted directly.

## Acceptance criteria

- [ ] Every Talent/category admin action rejects a request with no session and a request from a non-Admin session, before any database write occurs.
- [ ] An authenticated Admin session can still create, update, and delete Talents and Talent categories exactly as before.
- [ ] A regression test exists asserting at least one representative action (e.g. Talent update, category delete) is rejected when unauthenticated.

## Parent

docs/prd/access-control-hardening.md

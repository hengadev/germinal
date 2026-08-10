# 001 — Guard Event/Session/Media/Promo-Code admin actions

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add an Admin-role authorization check as the first step of every form action tied to Event management — the Event list, Event creation, Event detail (Overview, Photos/media, Sessions, Promotions tabs), and the standalone Sessions management route. Currently these actions only get a security check when the surrounding page is loaded via a normal page visit; submitting directly to the action endpoint executes with no check at all. Every action must reject an unauthenticated or non-Admin request before performing its side effect (creating, updating, publishing, or deleting an Event, Session, media item, or Promo Code).

## Acceptance criteria

- [ ] Every Event/Session/media/Promo-Code admin action rejects a request with no session and a request from a non-Admin session, before any database write occurs.
- [ ] An authenticated Admin session can still perform every action exactly as before (no regression to existing admin workflows).
- [ ] A regression test exists asserting at least one representative action from each of these areas (Event edit, Session create/delete, media delete, Promo Code create/deactivate) is rejected when unauthenticated.

## Parent

docs/prd/access-control-hardening.md

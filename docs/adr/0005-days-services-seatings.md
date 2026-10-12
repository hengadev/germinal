# ADR 0005 — Events are organised as Days → Services → Seatings

**Status**: Accepted
**Date**: 2026-10-12

## Context

An Event used to have a `startDate`/`endDate` interval and a flat list of Sessions, each with its own times, capacity and single price. Germinal's events are almost all meals, and organisers need to pick non-consecutive dates, run lunch and/or dinner on each, turn the room over several times per meal, and take a deposit rather than full payment.

## Decision

An Event has individually picked **Days**; each Day has a lunch and/or dinner **Service**; each Service has one or more **Seatings** (start and end time, own capacity, inherited from the Event's Venue Capacity). The Seating is the bookable unit and replaces the Session — the `event_sessions` table is kept and given a parent Service rather than renamed, so Reservations, Waitlist and Payments keep pointing at it. Menus are described once per Event and priced per Service that offers them. Deposit and Refund Policy are set per Event.

The change is additive on the real tables: new tables for Days, Services and Menus, existing Sessions migrated into Day → Service → Seating, and `events.startDate`/`endDate` recalculated from the Days.

## Considered Options

- **Staggered arrivals inside one shared capacity** (12:15, 12:30… all counting against the same lunch) — rejected for now: Germinal's venues turn over between sittings, so each Seating fills up on its own. Can be layered on later without changing the model.
- **Generic Services** (workshop, performance) instead of lunch/dinner only — deferred: nearly every current event is a meal, and the extra abstraction would slow down the first release. Adding Service kinds later does not require reshaping the model.
- **Parallel tables for the new model, migrated later** — rejected: it would create two sources of truth for the public page, admin and booking flow, leave new-style events unbookable, and the later migration would be the same work done twice.

## Consequences

- The terms of sale (CGV) must be rewritten before deposits go live: they currently promise full payment upfront and a full refund.
- Reservations must record the discounted total, the Deposit paid and the Balance due; Promo Codes discount the price, not the Deposit.
- In v1 only Admins cancel; the cancel screen pre-fills the refund the Event's Refund Policy dictates.

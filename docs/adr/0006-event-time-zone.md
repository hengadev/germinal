# ADR 0006 — Seatings are instants, entered and shown in the Event's Time Zone

**Status**: Accepted
**Date**: 2026-10-16

## Context

Seating start and end times are stored as UTC instants, but the admin typed them as if they were UTC wall-clock times ("20:00" stored as 20:00Z). The public page then formatted them in the visitor's browser zone, so a dinner meant for 20:00 in Paris showed as 22:00 to Paris visitors in summer. The lunch/dinner cut-off (16:00) and each Seating's Day were also computed in UTC. Germinal now runs Events outside France, so "Paris time everywhere" is not a fix either.

## Decision

Each Event has an IANA **Time Zone** (default `Europe/Paris`), chosen with the venue. Seatings stay stored as UTC instants. The admin types wall-clock times in the Event's Time Zone and the server converts them. Every display (admin, public page, Ticket, emails) formats them in the Event's Time Zone, never the server's or the visitor's, with no zone label. The lunch/dinner cut-off and a Seating's Day are evaluated in the Event's Time Zone.

Changing an Event's Time Zone keeps its Seatings' wall-clock times, so their instants move. It is refused once any Seating has a Reservation.

Existing Seatings are reinterpreted: their stored UTC clock reading becomes the Europe/Paris wall-clock time, which is what the admin meant when typing them.

## Considered Options

- **Wall-clock times + zone, instants derived on demand** — rejected: booking cut-offs, Refund Policy tiers ("48h before"), Waitlist expiry and reminders all compare against "now", and would each need a conversion (and awkward SQL) instead of a plain instant comparison.
- **Keep instants on a zone change** — rejected: the common reason to change the zone is that it was wrong when the times were typed, so the typed times are the truth.
- **Leave existing Seatings untouched in the migration** — rejected: every existing Event would shift by one or two hours.

## Consequences

- One shared conversion module (wall clock ↔ instant for a zone) replaces the UTC helpers in the schedule, Seating titles, the Seatings editor, the public Seating selector, the Ticket page and emails.
- The `.ics` file keeps UTC instants; calendar apps convert them.
- Guests in another zone see venue-local times with no label: the venue address implies the zone.

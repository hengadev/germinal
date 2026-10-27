# ADR 0009 — Capacity is an optional limit the Admin sets, not the size of the room

**Status**: Accepted
**Date**: 2026-10-27

## Context

The Venue Capacity (issue 021) was defined as "the number of guests the venue holds at once" and every Seating needed one: an Event could not be saved with a Seating until it was set, which contradicts ADR 0008 (saving requires nothing).

It also counts the wrong thing. Capacity limits the seats *reserved* per Seating, not the guests who turn up. On an Event without a Deposit some Guests do not show, so a limit equal to the room turns away Guests who would have come, and the Admin has no way to take more bookings than the room holds.

## Decision

- **Capacity is the number of seats put on sale per Seating**, chosen by the Admin. It may exceed the room on purpose, to absorb no-shows.
- **It is optional.** A blank Venue Capacity means no limit: every Seating inheriting it takes any number of Reservations. A Seating may still override it with its own number (e.g., a chef's table of 6).
- A Seating without a limit stores NULL total and available capacity. Booking keeps locking and decrementing the same columns; `NULL - quantity` stays NULL, so it never runs out. Seats held on it are counted from its live Reservations when a limit is set later, and a limit below them is refused as before.
- The per-Event cap on seats per Reservation (no Deposit) still applies.

## Considered Options

- **Keep the room size and add an overbooking margin** (a percentage on top) — rejected: two numbers to keep in step where one, chosen freely, says the same.
- **Require a capacity before publishing** — rejected by ADR 0008: publishing is the Admin's call.
- **Store 0 seats until a capacity is set** — rejected: a published Seating would read as sold out.

## Consequences

- A Seating without a limit is never full, so it never opens a Waitlist.
- The public page shows "Places disponibles" instead of a count for it; the admin dashboard shows seats reserved without a fill rate.
- Clearing the Venue Capacity removes the limit from every Seating that inherits it; overridden Seatings keep theirs.

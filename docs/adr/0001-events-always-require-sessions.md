# Events always require at least one Session to be published

> **Superseded (2026-10-16)** by [ADR 0008](0008-publishing-is-the-admins-call.md): publishing is no longer blocked. An Event without a Seating can be published (it is announced but not bookable); the missing Seating is shown as a warning before publishing.

Germinal events are intimate, capacity-controlled experiences — even free ones. Every Event must have at least one Session before it can be published, ensuring there is always a defined capacity and a booking flow. Open-door, walk-in events with no registration are explicitly out of scope. Free events are supported by setting a Session's price to zero, not by omitting Sessions.

> **Note (2026-10-12):** the bookable unit formerly called Session is now called **Seating** (see `CONTEXT.md`). The rule is unchanged: an Event needs at least one Seating to be published.

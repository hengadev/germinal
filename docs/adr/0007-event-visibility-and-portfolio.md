# ADR 0007 — Event Visibility, id links instead of slugs, and a post-event Portfolio

**Status**: Accepted
**Date**: 2026-10-16

## Context

An Event was either published or not, and a published Event appeared in the "Projets" listing (`/events`) whatever it was. Germinal also runs Private Events commissioned by clients, which must be bookable by their guests without being listed, and the site doubles as the studio's portfolio. Draft Events were reachable and bookable by slug, because the public page never checked `published`. Nothing is in production yet, so URLs and columns can change freely.

## Decision

- An Event has one **Visibility**: Draft (Admins only, with a preview of the public page), Private (anyone with the link can see and book; never listed, `noindex`, not in the sitemap, never the Spotlight) or Public. It replaces the `published` boolean. One shared check decides, for every public entry point (page, booking page and API, Waitlist, `.ics`, listings, Spotlight, sitemap), whether a visitor may see or book the Event.
- **Public URLs use the Event's id** (`/events/<id>`), and the slug is dropped. Event ids are random UUIDs, so a Private Event's link cannot be guessed and needs no separate access key.
- **"Projets" lists the Portfolio only.** The Portfolio is a post-event showcase: an Event joins it only once its last Seating has started (the one hard rule, so a Private Event's link is never listed while it can still be booked). It is shown with a Recap (EN/FR) and Event Photos kept apart from the announcement Visuals; a missing Recap or photo is a warning, as with publishing (ADR 0008). Its page then leads with the Recap and photos and hides the announcement text, Seatings and prices. Upcoming Events are listed only through the single Spotlight.

## Considered Options

- **`published` + independent `listed` flag** — rejected: allows a meaningless "unpublished but listed" state that every query must rule out.
- **Slug + secret access key for Private Events** — rejected: the key had to be threaded through the page, booking flow and Waitlist. The admins don't value readable URLs, and a random id already gives an unguessable link. Cost accepted: a leaked Private link cannot be revoked except by moving the Event back to Draft.
- **Portfolio as its own entity with an optional Event** — rejected for now: every project Germinal wants to show is an Event, commissioned dinners included.
- **Allowing upcoming Events in the Portfolio** — rejected: listing a Private Event would expose its booking link, and a Portfolio entry is only worth showing with photos of what took place.

## Consequences

- The create form loses its slug field. Routes, the `.ics` endpoint, emails and reminders move from slug to id.
- The Portfolio flag can only be set once the Event is over. A Public Event that is over and not in the Portfolio is listed nowhere, but its page stays reachable (Tickets link to it).
- The homepage gallery draws its cover from the Event Photos.

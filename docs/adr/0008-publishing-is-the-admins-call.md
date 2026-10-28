# ADR 0008 — Publishing is the Admin's call: nothing is required to save or publish

**Status**: Accepted
**Date**: 2026-10-16
**Supersedes**: ADR 0001
**Amended by**: ADR 0010 (how the editor saves)

## Context

Creating an Event required both titles, both descriptions, both locations, at least one Day and a Venue Capacity, and the database enforced most of these. An admin could not save half an Event and come back to it, and leaving the form lost everything typed across its tabs. Creating and editing were two separate forms that had to be kept in step. Publishing was refused without a Seating (ADR 0001), but nothing checked the gaps that actually hurt a published Event, such as a Service without a price, whose Seatings cannot be booked.

## Decision

- **Saving requires nothing.** An empty form creates nothing; as soon as anything is filled in, it can be saved as a Draft. The columns that forced completeness at creation become nullable.
- **One editor.** "Nouvel événement" opens the same tabbed editor as an existing Event. The first save creates the Draft, and the separate creation form is removed.
- **Publishing is never refused.** The Admin gets the tools to judge: a preview of the public page and a list of what is missing (no Seating, a Service without a price, no English text, no Visual, …), shown before publishing and while the Event is published. The list warns and never blocks.
- Leaving the editor with unsaved changes asks for confirmation.

## Considered Options

- **Keep a few blocking checks** (at least one Seating, prices set) — rejected: Admins are trusted to decide. A Public Event announced before its Seatings are known is a legitimate use, and the warnings make the gaps visible.
- **Autosave** — rejected for now: the Seatings and pricing editors validate as a whole, which makes partial saves on every keystroke a large piece of work for little gain over an explicit save with a leave guard.

## Consequences

- Public pages must render an Event with missing fields (no English text, no Seatings, no Visual) without breaking.
- A published Event may show Seatings that cannot be booked yet (no price). The public page presents them as not yet bookable rather than hiding the Event.
- The admin Events list shows "Sans titre" for an untitled Draft.

# 010 — Find-my-ticket email lookup flow

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

A small public form where a Guest enters the email address they booked with, and receives their Ticket link(s) again (e.g. re-sent by email, or a confirmation that an email was sent) rather than being permanently locked out if they lose the original confirmation email. This needs a new backend endpoint (looking up Reservations by Guest email) in addition to the form — apply the same anti-abuse measures (rate limiting, and considering a honeypot) used on the other public Guest-facing endpoints, since it's an unauthenticated lookup by email. The form itself is net-new Guest-facing UI: invoke the `impeccable` skill for its implementation so it matches the site's existing design decisions rather than being freehanded.

## Acceptance criteria

- [ ] A Guest can submit their booking email and receive their Ticket link(s) via email if a matching Reservation exists.
- [ ] Submitting an email with no matching Reservation does not reveal whether that email exists in the system (same response either way), to avoid turning this into an email-enumeration endpoint.
- [ ] The endpoint is rate-limited consistently with the app's other public Guest-facing endpoints.
- [ ] The new form UI was implemented using the `impeccable` skill and visually matches the rest of the site's design system.

## Parent

docs/prd/guest-booking-self-service.md

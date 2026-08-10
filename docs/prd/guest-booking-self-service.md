# Guest Booking & Self-Service

**Status:** Draft
**Date:** 2026-08-10

## Problem Statement

Guests can currently only book the single Spotlight Event — regular Event pages have no booking entry point at all, even when the Event is published with bookable Sessions. Guests also have no way to cancel a Reservation, search the Events listing, or recover a lost Ticket link, despite backend support already existing for some of these. Some public-facing UI text ignores the Guest's selected language, currency isn't formatted per locale, a dead/abandoned checkout implementation is left in the codebase, and there is no cookie-consent mechanism despite Germinal being a France-based paid-ticketing business with a published privacy policy.

## Solution

Bring the same session-selection and booking experience already built for the Spotlight page to every published Event that still has a bookable Session; expose the existing cancellation backend through a real UI entry point on the Ticket page; add a lightweight search box to the Events listing and an email-based Ticket lookup flow; complete the remaining locale/currency-formatting gaps; remove the dead checkout route; add social preview metadata and a cookie-consent banner.

## User Stories

1. As a Guest, I want to book a Session directly from any published Event's page (not just the Spotlight), so that I'm not limited to booking only the currently spotlighted Event.
2. As a Guest, I want the booking option to disappear once an Event's Sessions have all passed or the Event isn't published, so that I can't attempt to book something no longer available.
3. As a Guest, I want to cancel my own Reservation from my Ticket page within the allowed window, so that I don't have to email Germinal for a refund.
4. As a Guest, I want to search the Events listing by keyword, so that I can find a specific Event quickly.
5. As a Guest, I want to retrieve my Ticket link by re-entering the email I booked with, so that I'm not permanently locked out if I lose the confirmation email.
6. As a Guest, I want the site to consistently use my selected language everywhere, including the Waitlist form and booking page, so the experience doesn't feel half-translated.
7. As a Guest, I want prices formatted the way my locale expects, so the amount reads naturally.
8. As a Guest sharing an Event or Ticket link, I want a rich social preview (title/image), so the link looks trustworthy when shared.
9. As a Guest, I want to be asked for cookie consent in line with French/EU requirements, so that Germinal's data practices are transparent.

## Implementation Decisions

- **Module A — Event-page booking widget.** Reuse the existing session-selection/booking-modal experience (currently wired only into the Spotlight page) on the regular Event detail page. Visibility rule: the booking entry point is shown only when the Event is published **and** at least one of its Sessions has not yet started — a fully passed Event or an unpublished Event shows no booking affordance, consistent with Sessions (not Events) being the actual bookable unit. **This is frontend-heavy UI work — the `impeccable` skill must be invoked for the implementation so it matches the site's existing design decisions rather than being freehanded.**
- **Module B — Self-service cancellation entry point.** Add a "cancel my Reservation" action to the Ticket page, calling the existing cancel endpoint and surfacing its existing 24-hour eligibility window and refund confirmation to the Guest. No new backend logic — this is a UI module on top of an already-tested service.
- **Module C — Events search UI.** A search input on the Events listing, wired to the backend's existing keyword-search query parameter.
- **Module D — Find-my-ticket flow.** A small form (email input) that looks up the Guest's most recent Reservation(s) by email and re-sends or re-displays a link to the Ticket, rate-limited the same way other public Guest-facing endpoints are.
- **Module E — i18n completeness pass.** Convert the Waitlist form and the remaining hardcoded strings on the full-page booking flow to use the existing translation system; fix currency formatting to respect the Guest's active locale's number-formatting convention rather than always using English formatting.
- **Module F — Remove dead checkout route.** Delete the abandoned custom Stripe Elements checkout page and its unused session-storage-based handoff, since the real flow redirects to Stripe's hosted Checkout page instead.
- **Module G — Social preview metadata.** Add Open Graph/Twitter Card tags to Event, Talent, and Ticket pages.
- **Module H — Cookie consent.** Add a consent banner gating any non-essential cookies, consistent with the site's existing privacy policy.

## Testing Decisions

- Per the agreed test scope, this PRD does not require dedicated automated tests for the booking-widget gating logic or the other modules — verification is manual/QA: exercise the booking flow on a published upcoming Event, a published fully-past Event, and an unpublished Event, and confirm the widget is shown/hidden correctly in each case.
- The existing Reservation-creation integration tests already cover the underlying booking service logic and are unaffected by this PRD, which only changes where the existing UI is surfaced.

## Out of Scope

- Newsletter signup — explicitly deferred by the business owner; the existing non-functional signup UI is left untouched (neither fixed nor removed).
- Manifesto page placeholder imagery and hardcoded stats — deferred until real assets/numbers are available; not part of this PRD.
- Fixing the pre-existing broken Playwright e2e booking-flow spec — tracked as its own follow-up, not bundled here, since it predates this PRD and is a test-infrastructure concern rather than product behavior.
- Any account/login system for Guests — Guests remain token-based with no registration flow, per the project's existing domain decisions.

## Further Notes

- Module A (booking widget) is the highest-value module here and should be implemented first; Modules B–D are independent of it and of each other, and can be parallelized.
- The `impeccable` skill requirement in Module A applies to any other net-new Guest-facing UI in this PRD as well (find-my-ticket form, cancellation UI, search box) to keep visual consistency with the rest of the site.

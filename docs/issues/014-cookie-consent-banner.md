# 014 — Cookie consent banner

**Type:** HITL
**Status:** open
**Blocked by:** None

## What to build

Add a cookie-consent banner to the public site, gating any non-essential cookies, consistent with the site's existing privacy policy. Flagged HITL since the consent copy and exact behavior (what counts as "essential," what's blocked until consent, EU-compliant wording) benefits from a legal/product review before shipping, given Germinal's France/EU context.

## Acceptance criteria

- [ ] First-time visitors see a consent prompt before any non-essential cookie is set.
- [ ] The visitor's choice is remembered on subsequent visits.
- [ ] The banner's copy and behavior have been reviewed and approved by the business owner before merge.

## Parent

docs/prd/guest-booking-self-service.md

# 011 — i18n completeness pass

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Bring the remaining public-facing UI up to the same localization standard as the rest of the site: the Waitlist form (currently entirely hardcoded in English with no localization at all), the hardcoded French strings on the full-page booking flow that show regardless of the Guest's selected language, and currency formatting (which currently always renders using English number-formatting conventions regardless of the active locale).

## Acceptance criteria

- [ ] Every string in the Waitlist form respects the site's active language (English/French) using the existing translation system.
- [ ] The full-page booking flow shows no hardcoded French text when the site is in English.
- [ ] Currency amounts are formatted using the number-formatting convention of the Guest's active locale.
- [ ] Both existing locales' translation files remain in sync (no orphaned or missing keys).

## Parent

docs/prd/guest-booking-self-service.md

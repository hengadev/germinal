# 001 — Legal & Compliance Pages

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add three static bilingual (FR/EN) pages to the public site: a privacy policy (`/legal/privacy`), general terms of sale — CGV (`/legal/terms`), and an FAQ (`/faq`). All three render in the active locale using the existing i18n infrastructure.

A shared layout wrapper scopes the legal page chrome: narrow readable column, section headings, last-updated date. `/faq` reuses the same wrapper but lives at the top level rather than under `/legal/` since it is editorial rather than legal.

Content is authored directly in `en.json` and `fr.json` under `legal` and `faq` namespaces. No server-side load function is needed.

**Privacy policy** covers: data controller identity (Germinal — address TODO, marked visibly as `[ADRESSE — À COMPLÉTER]` so it cannot be accidentally published blank), categories of personal data collected (name, email, phone for Reservations; IP address and user-agent for fraud prevention), legal basis (contractual necessity / legitimate interest), retention periods, Guest rights under RGPD, and the privacy contact `privacy@germinalstudio.co`.

**CGV** covers: offer and acceptance, pricing in EUR, payment via Stripe, cancellation and refund policy consistent with the existing service behaviour (confirmed Reservations refunded in full), liability limits, governing law (French law, Paris jurisdiction).

**FAQ** covers: how to retrieve a Ticket by token link, what to do when a Session is sold out (join the Waitlist), how to cancel a Reservation, what the QR code is for, and how to contact Germinal.

The public layout footer must link to all three pages in both locales.

## Acceptance criteria

- [ ] `/legal/privacy` renders in French and English, switching with the locale toggle
- [ ] `/legal/terms` renders in French and English, switching with the locale toggle
- [ ] `/faq` renders in French and English, switching with the locale toggle
- [ ] The registered address placeholder is visibly marked as `[ADRESSE — À COMPLÉTER]` in both languages — not blank, not a lorem ipsum
- [ ] `privacy@germinalstudio.co` appears as the data controller contact in the privacy policy
- [ ] The public site footer links to all three pages
- [ ] All three pages are accessible without authentication
- [ ] No 404 on direct navigation to each route

## Parent

docs/prd/pre-launch-readiness.md

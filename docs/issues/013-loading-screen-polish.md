# 013 — Polish loading screen wordmark

**Type:** AFK
**Status:** open
**Blocked by:** 003 — Promote Newsreader + Gilda Display as typography system

## What to build

The root layout shows a bare `<div class="text-lg">Loading...</div>` while the i18n system initialises. On slow connections this is the first thing a visitor sees, and it sets a poor brand impression.

Replace it with a centred Germinal wordmark using the `font-serif` slot (Gilda Display, consistent with the nav logo mark) paired with a subtle fade-pulse CSS animation. No spinner — consistent with the brand's restraint. The wordmark can be styled similarly to the nav logo: `text-xl font-medium font-serif uppercase`.

The animation should:
- Gently pulse the opacity (e.g. between 0.4 and 1.0) on a slow cycle (~1.5s ease-in-out infinite).
- Respect `prefers-reduced-motion` (static, no animation if the user has reduced motion enabled).

## Acceptance criteria

- [ ] The loading state no longer shows the plain "Loading..." text.
- [ ] A centred "Germinal" wordmark appears in Gilda Display (font-serif) during the loading state.
- [ ] The wordmark pulses gently while loading.
- [ ] The animation is absent when `prefers-reduced-motion: reduce` is set.
- [ ] The transition from loading screen to page content is not jarring.

## Parent

docs/prd/frontend-design-polish.md — Module 13

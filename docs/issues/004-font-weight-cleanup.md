# 004 — Font weight + font-base cleanup

**Type:** AFK
**Status:** open
**Blocked by:** 003 — Promote Newsreader + Gilda Display as typography system

## What to build

Two mechanical cleanup passes across public-facing Svelte files:

**Pass 1 — font-bold → font-medium in refined heading contexts.**
The brand aesthetic is editorial and restrained. `font-bold` in heading positions reads as heavy and mismatched. Replace it with `font-medium` (or `font-semibold` where slightly more weight is needed) in these specific locations:
- Talent detail page: the artist's full name heading.
- Event detail and spotlight gallery section heading ("Gallery").
- Ticket page: the event title inside the dark header card.

Do not change `font-bold` on decorative elements like the homepage stats numbers (`text-6xl font-bold`) — heavy weight there is intentional for visual impact.

**Pass 2 — font-base → font-normal.**
`font-base` is not a valid Tailwind utility class and silently has no effect. Every occurrence across the public site should be replaced with `font-normal` (or removed if `font-normal` is already the inherited weight).

## Acceptance criteria

- [ ] The talent detail name heading no longer uses `font-bold`.
- [ ] The gallery section headings on event detail and spotlight pages no longer use `font-bold`.
- [ ] The ticket page event title no longer uses `font-bold`.
- [ ] Zero occurrences of `font-base` remain in `src/routes/(public)` and `src/lib/components`.
- [ ] The homepage stats numbers (`30+`, `80+`, `5`) still use `font-bold` — intentional, not changed.

## Parent

docs/prd/frontend-design-polish.md — Module 8

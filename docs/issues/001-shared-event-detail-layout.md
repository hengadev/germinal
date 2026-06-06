# 001 — Extract shared EventDetailLayout component

**Type:** AFK
**Status:** done
**Blocked by:** None

## What to build

The full-height hero section (background media, gradient overlay, back-to-events link, title + subtitle at the bottom) and the two-column event aside (location, timings, details) are duplicated verbatim between the event detail page (`/events/[slug]`) and the spotlight page (`/spotlight`). Extract these into a single `EventDetailLayout.svelte` component in `src/lib/components/`.

The component receives the event data object and renders the hero and aside. It exposes a default slot (or `children` snippet) for page-specific content that appears below the aside — on the spotlight page this is the session booking section; on the event detail page it is the media gallery.

The `asideTitle` and `asideLastPart` snippets, currently defined locally in both pages, move inside the shared component as internal snippets.

Both `/events/[slug]/+page.svelte` and `/spotlight/+page.svelte` become thin wrappers that pass their event data to `EventDetailLayout` and provide page-specific content via the slot.

## Acceptance criteria

- [x] A single `EventDetailLayout.svelte` component exists and is used by both the event detail page and the spotlight page.
- [x] Neither of the two page files contains any hero or aside markup — all of it lives in the shared component.
- [x] The event detail page still shows the media gallery below the aside (via slot).
- [x] The spotlight page still shows the session booking section below the aside (via slot).
- [x] The spotlight "no event" empty state remains on the spotlight page, outside the shared component.
- [x] Both pages render identically to before in a browser (visual regression check).

## Parent

docs/prd/frontend-design-polish.md — Module 7

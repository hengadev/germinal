# 007 — Card hover: grayscale → colour reveal

**Type:** AFK
**Status:** open
**Blocked by:** 006 — Replace gray-* with dark-scale tokens

## What to build

Both `EventCard` and `TalentCard` apply a static `grayscale` filter to their cover images and only scale the image on hover (`hover:scale-105`). Change the hover interaction so that hovering removes the grayscale filter, revealing the image in full colour. This becomes the single, memorable card interaction signature across the public site.

Implementation:
- Add the `group` class to the card anchor element if not already present.
- On the image element: replace static `grayscale hover:scale-105` with `grayscale group-hover:grayscale-0 transition-[filter] duration-500`.
- The scale effect can be removed entirely or kept at a very subtle value (`group-hover:scale-[1.02]`) — the colour reveal is the primary interaction.
- Apply the same pattern to both `EventCard` and `TalentCard`.

## Acceptance criteria

- [ ] Hovering an `EventCard` reveals the cover image in full colour with a smooth transition.
- [ ] Hovering a `TalentCard` reveals the profile image in full colour with a smooth transition.
- [ ] The colour reveal transition duration is perceptible but not slow (around 400–500ms).
- [ ] Images default to grayscale when not hovered.
- [ ] The interaction works correctly on the homepage, events listing, and talents listing pages.

## Parent

docs/prd/frontend-design-polish.md — Module 5

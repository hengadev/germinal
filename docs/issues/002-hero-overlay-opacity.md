# 002 — Reduce hero overlay opacity

**Type:** AFK
**Status:** open
**Blocked by:** 001 — Extract shared EventDetailLayout component

## What to build

The hero sections across the public site use a flat `bg-black/80` overlay that buries the underlying video or image. Replace it with a directional gradient that preserves legibility at the top (navigation, back button) and bottom (event title text) while allowing the media to breathe in the middle.

Three hero locations are affected:
1. The homepage hero section.
2. The event detail hero — now inside `EventDetailLayout` after issue 001.
3. The spotlight hero — also inside `EventDetailLayout` after issue 001.

The gradient direction should go from bottom to top: strong at the bottom (title text contrast), lighter in the middle, moderate at the top (nav/back button contrast). A two-stop or three-stop `bg-gradient-to-t` achieves this. The exact values should be tuned so the media is clearly visible in the centre of the frame.

## Acceptance criteria

- [ ] The homepage hero, event detail hero, and spotlight hero no longer use a flat `bg-black/80` overlay.
- [ ] All three hero sections use a directional gradient overlay.
- [ ] Text at the top of each hero (back button, nav items through the transparent nav) remains legible against the media.
- [ ] The event title and subtitle at the bottom of each hero remain legible.
- [ ] The underlying media is visibly richer / less obscured than before in the centre of the frame.

## Parent

docs/prd/frontend-design-polish.md — Module 1

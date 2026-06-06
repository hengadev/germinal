# 006 — Replace gray-* with dark-scale tokens

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Tailwind's default gray scale (`text-gray-*`, `bg-gray-*`) leaks into several public-facing components alongside the custom `dark-*` token scale. The two scales have slightly different hues, creating perceptible inconsistencies — especially visible in grayscale images and placeholder backgrounds.

Replace every occurrence of `text-gray-*` and `bg-gray-*` in the public site components with the closest equivalent from the custom dark token scale:

| Default gray | Custom dark equivalent |
|---|---|
| `bg-gray-200` | `bg-dark-100` |
| `text-gray-400` | `text-dark-300` |
| `text-gray-500` | `text-dark-400` |

Target locations: `EventCard`, `TalentCard`, list-view blocks inside the events and talents pages, talent detail page (placeholder avatar), spotlight empty state.

## Acceptance criteria

- [ ] Zero occurrences of `text-gray-*` or `bg-gray-*` remain in `src/routes/(public)` and `src/lib/components/EventCard.svelte` and `src/lib/components/TalentCard.svelte`.
- [ ] All placeholder backgrounds and muted text use tokens from the `dark-*` scale.
- [ ] No visible hue shift appears on cards or placeholder elements after the change.

## Parent

docs/prd/frontend-design-polish.md — Module 10

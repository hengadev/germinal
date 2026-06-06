# Frontend Design Polish

**Status:** Draft
**Date:** 2026-06-06

## Problem Statement

Germinal is a French creative studio specialising in art direction, scenography, and production. The public-facing website has a solid editorial foundation — monochromatic palette, serif logo mark, scroll-reveal animations — but a series of inconsistencies and missed opportunities prevent it from feeling genuinely distinctive and aligned with the brand's cultural ambition.

Specific pain points visible to visitors:
- The hero video/image is buried under an 80% black overlay, negating the studio's most powerful visual asset.
- The body font (Inter) is among the most overused on the internet, stripping any typographic character from an arts organisation that depends on visual sophistication.
- Buttons appear in three different shapes across pages (rounded-full, rounded-lg, sharp) with no logic, signalling an unresolved design system.
- Event cards show no dates, making it impossible to scan a listing quickly.
- The FAQ is a static list with no hierarchy or interaction.
- Hardcoded English strings appear in a bilingual (FR/EN) product.
- The default Tailwind gray scale leaks into the custom dark-scale palette in several places, creating perceptible hue shifts.
- Duplicated hero + aside code between the event detail and spotlight pages creates a maintenance risk.

## Solution

A focused polish pass across the public site that resolves each identified inconsistency. The work is grouped into 13 discrete, independently-shippable modules — each can be reviewed and merged on its own.

The target aesthetic post-polish: a refined French editorial studio. Newsreader for body text (optical-size serif, warm, authoritative), Gilda Display exclusively for display headings and the logo mark, rectangular/sharp buttons everywhere (editorial, not playful), and a signature card interaction that reveals colour on hover from a default grayscale state.

## User Stories

1. As a visitor, I want to immediately see the studio's visual work in the hero, so that I understand the brand before reading a word.
2. As a visitor, I want consistent button shapes, so that interactive elements feel intentional and trustworthy.
3. As a visitor, I want to see event dates on listing cards, so that I can quickly assess relevance without clicking through.
4. As a visitor, I want talent and event cards to reveal their colour when I hover, so that the interaction feels alive and surprising.
5. As a visitor, I want the FAQ to be scannable at a glance, so that I can jump to the question that matters to me without reading everything.
6. As a French-speaking visitor, I want all UI strings to appear in French when I switch the language, so that the site feels fully localised.
7. As a visitor on a slow connection, I want a polished loading screen instead of plain text, so that the brand impression starts from the first frame.
8. As a developer, I want a single shared event-detail layout component, so that changes to the hero or aside structure only need to be made in one place.
9. As a developer, I want all colour utilities to use the custom dark-scale tokens, so that dark-mode inversions work correctly across the entire site.

## Implementation Decisions

### Module 1 — Hero overlay opacity
Reduce the solid black overlay on the homepage hero and on event/spotlight full-height hero sections. Replace flat `bg-black/80` with a directional gradient that preserves contrast at top (nav/back button) and bottom (title text) while allowing the media to breathe in the middle.

### Module 2 — Typography system
- Remove Inter from active use as the primary body font.
- Promote Newsreader (already imported, currently unused) to `--font-sans` in `app.css`, making it the default body typeface.
- Restrict Gilda Display to the `--font-serif` slot and apply it consistently to all page headings (h1, h2 on section headers) and the nav logo mark.
- Keep Source Code Pro on `--font-mono`.
- Remove the Outfit import (currently `--font-display`) as it becomes redundant.

### Module 3 — Button shape consistency
Audit all interactive button elements across public pages. Settle on sharp corners (no border-radius, or `rounded-sm` at most) for primary/CTA buttons to reinforce the editorial aesthetic. Pill-shaped (`rounded-full`) buttons are retained only for filter/tag elements (category filters, inquiry-type tags) where the pill shape carries semantic meaning (a removable filter chip). Document this distinction in a code comment on the base classes.

### Module 4 — EventCard date display
Add the event start date below the location line on `EventCard`. Use `startDate` already available on `EventWithMedia`. Format using the locale-aware date formatter already used elsewhere in the codebase. Keep the same minimal typographic style (`text-xs text-dark-400 uppercase tracking-widest`) to avoid disrupting the card's visual rhythm.

### Module 5 — Card hover colour reveal
Both `EventCard` and `TalentCard` currently apply `grayscale` statically and only scale on hover. Change the hover interaction to: remove grayscale (`grayscale group-hover:grayscale-0`) with a smooth `transition-[filter]` duration. The scale effect can be removed or kept at a subtler value (1.02). The grayscale→colour reveal becomes the single, memorable card interaction signature.

### Module 6 — Stats section dividers
On the homepage stats section, add thin vertical borders (`border-l border-dark-100`) between the three stat columns. The first column has no left border; the second and third columns do. This gives the three numbers visual containment without adding any new elements.

### Module 7 — Shared EventDetailLayout component
Extract the full-height hero (background media, gradient overlay, back button, title block) and the two-column aside (location, timings, details) shared verbatim between `/events/[slug]` and `/spotlight` into a new `EventDetailLayout.svelte` component. The component accepts the event data shape and an optional `children` slot for page-specific content (e.g. the session booking section on spotlight). Both pages become thin wrappers.

### Module 8 — Font weight cleanup
Across the public site, replace `font-bold` with `font-medium` in heading contexts that should read as refined rather than heavy:
- Talent detail page name
- Event/spotlight gallery section heading
- Ticket page event title in the dark header

Also replace all occurrences of the non-existent utility `font-base` with `font-normal`.

### Module 9 — i18n string cleanup
Add translation keys for all hardcoded English strings found in the public UI:
- Filter label "All" on the events and talents listing pages
- List-view "View Details" label on events and talents
- Empty-state strings "No events found in this category." and "No talents found in this category."

Keys follow the existing `events.*` and `talents.*` namespaces.

### Module 10 — Palette cleanup (`gray-*` → `dark-*`)
Replace every occurrence of Tailwind's default gray scale (`text-gray-*`, `bg-gray-*`) in public-facing components with the closest equivalent from the custom dark token scale. Target files: `EventCard`, `TalentCard`, both list-view blocks in events and talents pages, talent detail page, spotlight empty state.

### Module 11 — FAQ accordion
Replace the static list of Q&A pairs on the FAQ page with an accessible accordion. Use the native HTML `<details>`/`<summary>` elements (no JS dependency, no new package) with a CSS chevron indicator that rotates on open. Keep the existing border-top separators and spacing. The first item should open by default.

### Module 12 — Navigation scroll transition
Add `transition-colors duration-300` to the navigation container's class list. This smooths the abrupt snap between the transparent-on-hero and white-on-scroll states.

### Module 13 — Loading screen polish
Replace the plain `<div class="text-lg">Loading...</div>` in the root layout with a centred Germinal wordmark (using `font-serif`) and a subtle fade-pulse animation. No spinner — consistent with the brand's restraint.

## Testing Decisions

These are purely visual/typographic changes with no business logic. Unit or integration tests are not applicable. Manual acceptance criteria for each module are listed in the corresponding issue. If the project adds visual regression testing in the future (e.g. Playwright screenshot diffs), these modules are good candidates for baseline snapshots.

## Out of Scope

- Manifesto placeholder images (picsum.photos) — content/CMS concern, not a design system issue.
- TalentCard last-name initial truncation — requires a product decision on privacy intent before changing.
- Contact page grid layout restructuring — the existing `auto_1fr` grid is functional; a full layout rethink is a separate project.
- Admin panel design — separate domain, different aesthetic requirements.
- New pages or new sections (e.g. Partners section, newsletter backend integration).
- Dark mode — the dark scale is defined and the infrastructure exists, but activating it site-wide is a separate project.

## Further Notes

- The Newsreader font is already imported in `app.css` — no new network request is introduced by promoting it to the primary font.
- Module 7 (shared layout component) is the highest-risk change in terms of regression surface, even though it is a pure refactor. It should be implemented and reviewed before the other typography/style changes so any regressions are easy to attribute.
- Module 3 (button consistency) touches the most files. A grep for `rounded-full`, `rounded-lg`, and `rounded-` across `src/routes/(public)` before starting will give a complete picture of scope.
- Modules 9 and 10 are purely mechanical find-and-replace with no visual output change — good candidates to batch into a single commit.

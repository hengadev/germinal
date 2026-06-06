# 003 — Promote Newsreader + Gilda Display as typography system

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Establish a clear two-font editorial system for the public site:

- **Newsreader** (optical-size serif, already imported in `app.css`, currently unused) becomes the primary body typeface — reassign `--font-sans` to point to Newsreader. This makes it the default for all `font-sans` utility usages and the `body` element.
- **Gilda Display** (currently only on the nav logo mark) becomes the exclusive display/heading font via `--font-serif`. Apply `font-serif` to all page-level headings (`h1` and section `h2`) across every public page: homepage, events listing, event detail, spotlight, manifesto, talents listing, talent detail, contact, FAQ.
- **Source Code Pro** stays on `--font-mono`. No change.
- **Outfit** (`--font-display`) and its Google Fonts import are removed — the slot becomes redundant.
- **Inter** import is retained for now (it may still be used in the admin panel) but removed from `--font-sans`.

The nav logo mark already uses `font-serif` (Gilda Display) — no change needed there.

## Acceptance criteria

- [ ] `--font-sans` in `app.css` points to Newsreader; the `body` default typeface is Newsreader.
- [ ] `--font-serif` in `app.css` points to Gilda Display.
- [ ] The Outfit Google Fonts import and `--font-display` custom property are removed from `app.css`.
- [ ] All public-facing page-level `h1` elements use `font-serif` (Gilda Display).
- [ ] All section `h2` headings on the homepage, manifesto, events, talents, contact, and FAQ pages use `font-serif`.
- [ ] Body text (paragraphs, labels, metadata) renders in Newsreader.
- [ ] The admin panel appearance is not broken by these changes.

## Parent

docs/prd/frontend-design-polish.md — Module 2

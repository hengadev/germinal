# 010 — FAQ accordion with details/summary

**Type:** AFK
**Status:** closed
**Blocked by:** None

## What to build

The FAQ page currently renders all five Q&A pairs as a flat static list. Replace it with an accessible accordion using native HTML `<details>` / `<summary>` elements — no JS, no new dependency.

Design details:
- Each `<details>` block wraps one question/answer pair.
- The `<summary>` contains the question text and a chevron icon (CSS-only, rotates 180° when the item is open via the `[open]` attribute selector).
- The answer text sits inside the `<details>` block below the `<summary>`.
- Keep the existing `border-t border-dark-100` separators and `py-8` spacing between items.
- The first item should have the `open` attribute by default so the page does not appear empty on load.
- The chevron and transition should respect `prefers-reduced-motion`.

## Acceptance criteria

- [ ] All FAQ items are interactive — clicking a question expands or collapses its answer.
- [ ] Only the clicked item expands (native `<details>` behaviour — multiple can be open simultaneously, which is acceptable).
- [ ] The first FAQ item is open by default.
- [ ] A chevron indicator rotates when an item opens and returns when it closes.
- [ ] The accordion works without JavaScript enabled.
- [ ] The existing border separators and spacing are preserved.
- [ ] The page title and layout are unchanged.

## Parent

docs/prd/frontend-design-polish.md — Module 11

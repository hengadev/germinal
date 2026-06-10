# 014 — Surface token definitions

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Add three semantic surface tokens to `app.css` — `--surface`, `--surface-hover`, and `--surface-active` — in both the `:root` (light) and `.dark` blocks, and register them in the `@theme inline` block so Tailwind generates the corresponding utility classes.

Light values:

| Token | Value |
|---|---|
| `--surface` | `hsl(0 0% 93%)` |
| `--surface-hover` | `hsl(0 0% 88%)` |
| `--surface-active` | `hsl(0 0% 83%)` |

Dark values:

| Token | Value |
|---|---|
| `--surface` | `hsl(0 0% 12%)` |
| `--surface-hover` | `hsl(0 0% 16%)` |
| `--surface-active` | `hsl(0 0% 20%)` |

Register as `--color-surface`, `--color-surface-hover`, `--color-surface-active` in `@theme inline`.

No component files are touched in this issue. This is the prerequisite that unblocks the three migration issues (015, 016, 017).

## Acceptance criteria

- [ ] `bg-surface`, `hover:bg-surface`, `bg-surface-hover`, `hover:bg-surface-hover`, `bg-surface-active` are valid Tailwind utilities after this change (no build warnings)
- [ ] `--surface` in light mode renders visually close to the current `--dark-50` (`hsl(0 0% 95%)`) — a near-white panel background
- [ ] `--surface` in dark mode renders as a dark panel background (`hsl(0 0% 12%)`)
- [ ] No existing component classes are changed

## Parent

`docs/prd/design-system-architecture.md`

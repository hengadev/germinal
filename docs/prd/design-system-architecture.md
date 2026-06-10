# Design System Architecture Cleanup

**Status:** Draft
**Date:** 2026-06-10

## Problem Statement

The design token layer in `app.css` carries three structural problems that make it increasingly risky to extend the UI correctly:

1. A 9-stop numeric colour scale (`dark-50`…`dark-900`) does the majority of visual work across 389 class usages in 31 files, but its values invert silently in dark mode — `dark-900` becomes the *lightest* value. This is documented only by an inline comment, making it a latent correctness bug for any developer writing new components.

2. Generic Tailwind shadow utilities (`shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`) coexist with a set of named design tokens (`shadow-mini`, `shadow-popover`, `shadow-card`) with no documented rule for which to use. New components default to generic utilities, widening the divergence.

3. Four pixel-literal radius aliases (`radius-5px`, `radius-9px`, `radius-10px`, `radius-15px`) duplicate values already expressed by semantic names (`radius-button`, `radius-input`, `radius-card-sm`). They are unused in components today, but their presence invites future misuse.

A fourth, smaller problem: `--font-alt` (Courier) is defined and registered in `@theme` but has zero usages anywhere in the codebase.

## Solution

Six independent, sequentially-safe modules eliminate each structural problem:

1. Define three semantic surface tokens (`surface`, `surface-hover`, `surface-active`) in `app.css` for both light and dark modes.
2. Migrate all `dark-*` numeric class usages in public routes to the correct semantic tokens.
3. Migrate all `dark-*` numeric class usages in admin routes.
4. Migrate all `dark-*` numeric class usages in shared library components.
5. Replace the 11 generic Tailwind shadow utilities with named tokens.
6. Remove pixel-literal radius aliases and the unused `font-alt` token from `app.css`.

After this work, no component will reference the numeric `dark-*` scale (except the three opacity tints `dark-10`, `dark-40`, `dark-04`, which are intentional and kept). Every surface, text, border, and shadow utility in the codebase will point to a token whose name describes its intent.

## User Stories

1. As a developer adding a new admin page, I want surface background utilities that have the same visual meaning in light and dark mode, so that I don't need to look up the inverted scale to pick the right value.
2. As a developer adding a new card or panel, I want a single shadow vocabulary, so that I don't have to decide between `shadow-sm` and `shadow-mini` without documentation.
3. As a developer adding a new form component, I want radius tokens with semantic names, so that I can pick `radius-input` confidently rather than `radius-9px`.
4. As a developer reading `app.css`, I want every defined token to be used somewhere in the codebase, so that the token file accurately reflects the active design system.
5. As an Admin reviewing the back-office UI, I want surface and text colours to be visually consistent across all admin pages, so that the interface feels coherent when managing Events, Reservations, and Talent.

## Implementation Decisions

### Module 1 — Surface token definitions

Add three new CSS custom properties to both `:root` (light) and `.dark` (dark mode) in `app.css`:

| Token | Light value | Dark value |
|---|---|---|
| `--surface` | `hsl(0 0% 93%)` | `hsl(0 0% 12%)` |
| `--surface-hover` | `hsl(0 0% 88%)` | `hsl(0 0% 16%)` |
| `--surface-active` | `hsl(0 0% 83%)` | `hsl(0 0% 20%)` |

Register all three in the `@theme inline` block as `--color-surface`, `--color-surface-hover`, `--color-surface-active` so Tailwind generates `bg-surface`, `hover:bg-surface-hover` etc.

This module is a prerequisite — it must ship before any migration module.

### Module 2 — dark-* migration: public routes

Target: `src/routes/(public)/`. Apply the following mechanical substitutions:

| Current class | Replacement |
|---|---|
| `bg-dark-50`, `hover:bg-dark-50` | `bg-surface`, `hover:bg-surface` |
| `hover:bg-dark-100/50`, `bg-dark-100` | `hover:bg-surface-hover`, `bg-surface-hover` |
| `text-dark-900` | `text-foreground` |
| `text-dark-700`, `text-dark-800` | `text-foreground-alt` |
| `text-dark-400`, `text-dark-500`, `text-dark-600` | `text-muted-foreground` |
| `text-dark-300`, `text-dark-200` | `text-muted-foreground` |
| `placeholder-dark-300` | `placeholder-muted-foreground` |
| `border-dark-50` | `border-border-input` |
| `border-dark-100` | `border-border-input-hover` |

**Do not migrate:** `dark-10`, `dark-40`, `dark-04` — these are opacity tints used for shadows and overlays and must remain.

**Sidebar/nav convention:** active nav items should rest on `bg-surface-hover` (not `bg-surface`) so they pop against a `bg-background-alt` shell; hover state transitions to `bg-surface-active`.

### Module 3 — dark-* migration: admin routes

Target: `src/routes/(admin)/`. Apply the same substitution map as Module 2. The admin sidebar uses `dark-*` for active-item and hover-item backgrounds — apply the sidebar/nav convention from Module 2.

Module 2 should be reviewed and merged before this module starts, to keep the substitution map stable.

### Module 4 — dark-* migration: shared lib components

Target: `src/lib/`. Apply the same substitution map. Shared components (Toast, PWAInstallPrompt, bits-ui wrappers, form elements) feed both public and admin surfaces — migrate them last so both route trees are already consistent when these are updated.

### Module 5 — Shadow consolidation

Replace all 11 occurrences of generic Tailwind shadow utilities in component files:

- `shadow-sm` → `shadow-mini`
- `shadow-md`, `shadow-lg`, `shadow-xl` → `shadow-popover`

Add a short mapping comment above the shadow token definitions in `app.css` to document the rule, e.g.:

```
/* Generic Tailwind shadows are not used — map: shadow-sm → shadow-mini, shadow-md/lg/xl → shadow-popover */
```

The `PWAInstallPrompt` component references `shadow-lg` alongside a `dark:border-gray-*` that also needs migration — handle both together in this module.

### Module 6 — app.css token cleanup

**Radius aliases:** `radius-5px` duplicates `radius-button` (5 px), `radius-9px` duplicates `radius-input` (9 px), `radius-10px` duplicates `radius-card-sm` (10 px). Remove all three. `radius-15px` has no semantic equivalent — rename it to `radius-card-inner: 15px`. Zero component files currently reference the pixel-literal names, so no component edits are needed.

**font-alt:** Remove the `--font-alt` custom property from `:root`, its `--font-alt` entry from `@theme inline`, and the Courier system font declaration. No `@import` to remove (Courier is a system font, not a Google Fonts import). Confirm zero usages with a codebase grep before deleting.

## Testing Decisions

These are mechanical class-name substitutions with no business logic, state transitions, or data flow changes. Automated unit or integration tests are not applicable.

Manual acceptance for each module:
- Spin up the dev server and visually compare a representative public page (e.g. the Events listing and an Event detail page) before and after Modules 2–4 to confirm no colour regression.
- Check the admin sidebar and a management page (e.g. Reservations) after Module 3.
- After Module 5, inspect the Toast and any panel/popover that previously used a generic shadow to confirm the named token renders identically.
- After Module 6, confirm the app compiles without unknown-token warnings and the border-radius of inputs, buttons, and cards is unchanged.

## Out of Scope

- Dark mode activation (toggling the `.dark` class site-wide) — the tokens support it, but enabling it is a separate project.
- Admin panel visual redesign.
- Any new pages, sections, or feature changes — those belong to the frontend-design-polish sprint.
- Removing or replacing the numeric `dark-*` token *definitions* from `app.css` — the definitions stay so that any remaining intentional usages (opacity tints, edge cases) continue to resolve. Only the component-level class usages are migrated.
- Visual regression test baseline snapshots.

## Further Notes

- The three opacity tint tokens (`dark-10`, `dark-40`, `dark-04`) are structurally different from the numeric scale — they represent fixed opacity of the base `--dark` colour, not stops on a lightness ramp. They are used for shadow compositing and overlays and must not be migrated.
- Module 1 (token definitions) is the only blocking prerequisite. Modules 2–4 are independent of each other and can be worked in parallel once Module 1 is merged. Modules 5 and 6 are also independent and can be done in any order.
- The `PWAInstallPrompt` component contains `dark:border-gray-*` and `dark:bg-gray-*` Tailwind gray-scale leakage alongside its generic shadow — clean all three in Module 5 rather than splitting across modules.

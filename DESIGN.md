---
name: Germinal
description: Editorial cultural-studio site for curated events and a standing artist roster, with a new threshold system marking access-gated sessions.
colors:
  ink: "#171717"
  ink-soft: "#525252"
  paper: "#ffffff"
  surface: "#ededed"
  surface-hover: "#e0e0e0"
  surface-active: "#d4d4d4"
  muted: "#f4f4f5"
  pale-sky: "#e1f3fe"
  pale-sky-ink: "#082f49"
  crimson: "#e21d48"
  amber: "#f59e0b"
typography:
  display:
    fontFamily: "Gilda Display, serif"
    fontSize: "clamp(2.25rem, 6vw, 6rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "normal"
  body:
    fontFamily: "Newsreader, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Newsreader, serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.15em"
  mono:
    fontFamily: "Source Code Pro, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  none: "0px"
  button: "5px"
  input: "9px"
  card-sm: "10px"
  card-inner: "15px"
  card: "16px"
  card-lg: "20px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-outline-hover:
    backgroundColor: "{colors.surface}"
  event-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  threshold-block:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "24px"
---

# Design System: Germinal

## 1. Overview

**Creative North Star: "The Editorial Sanctuary"**

Germinal reads like a magazine profiling a studio, not a platform selling tickets. The default register is calm and restrained: near-black ink on white paper, a display serif carrying the emotional weight of headlines, generous whitespace, and thin dividers standing in for card chrome. Nothing about the resting state raises its voice — no shadows, no rounded softness, no color noise. That calm is deliberate, not timid: the confidence is in what's left out.

Against that calm baseline, one deliberate break exists: not every Session is for everyone. Some are open to the public; others — VIP-badged, or carrying Admission Info like "Members only" — are for a smaller circle. Rather than presenting every event with identical, universally-welcoming treatment, gated content earns the one moment of real visual contrast in the system: it inverts. See **§4 Elevation, The Threshold Rule**.

This system explicitly rejects two things named in PRODUCT.md: the generic ticketing-platform look (thumbnail card grids, marketplace density, badges scattered everywhere) and the corporate SaaS aesthetic (startup-cream backgrounds, hero-metric sections, dashboard chrome bleeding into public pages). Germinal is a cultural brand being read, not a product being adopted.

**Key Characteristics:**
- Near-monochrome palette (ink / paper / grayscale surfaces) with two functional accents (amber, crimson) held in reserve, not decorative
- Serif-forward typography pairing a display serif (headlines) with a text serif (body) — no grotesque/geometric sans anywhere in the core voice
- Flat by default: no shadows, no rounded corners, depth conveyed by whitespace and a single grayscale→color image treatment on hover
- One deliberate inversion (ink-on-paper flips to paper-on-ink) reserved exclusively for access-gated content — the system's only "loud" gesture, and it's earned by meaning, not decoration

## 2. Colors

Almost monochrome: ink and paper carry the entire resting-state palette, with grayscale surface steps for structure and two small functional accents held in reserve.

### Primary
- **Ink** (#171717): the near-black used for all primary text and, inverted, as the background for access-gated (threshold) content. Carries the brand's authority — it is used, not merely available.
- **Paper** (#ffffff): the resting background for nearly every surface. Public pages are built on white, not off-white — there is no cream/sand tint anywhere in the system.

### Secondary
- **Ink Soft** (#525252): secondary/alt body text (`--foreground-alt`) and the button hover state for primary actions — a controlled step down from full ink, never a light gray.

### Tertiary (functional accents, used sparingly)
- **Amber** (#f59e0b): the `--tertiary` token. Reserved for a single functional signal — e.g. a countdown/urgency moment (checkout timer) — never used decoratively across sections.
- **Crimson** (#e21d48): the `--destructive` token. Errors and destructive actions only.
- **Pale Sky** (#e1f3fe) with **Pale Sky Ink** (#082f49) as its paired text color: a soft accent pairing reserved for low-emphasis informational tags. Currently under-used relative to its definition in the token set — treat as available, not as a call to introduce blue accents broadly.

### Neutral
- **Surface** (#ededed) / **Surface Hover** (#e0e0e0) / **Surface Active** (#d4d4d4): the grayscale step used for subtle section backgrounds, image placeholders, and interactive-state layering — never a substitute for the ink/paper contrast that carries text.
- **Muted** (#f4f4f5): background for the softest UI chrome (e.g. hover states in navigation drawers).

### Named Rules
**The No-Warmth Rule.** Every neutral in this system is a true gray (near-zero saturation), never tinted warm or cool. Paper is `#ffffff`, not a cream or sand approximation — that warm-neutral drift is the default AI reads as "safe," and it is explicitly rejected here.

**The Reserve Rule.** Amber and crimson each serve exactly one functional purpose (urgency, error) and must never be introduced as decorative accents, section dividers, or badge-filling colors. Their rarity is what makes them legible as signals.

## 3. Typography

**Display Font:** Gilda Display (serif)
**Body Font:** Newsreader (serif)
**Label/Mono Font:** Source Code Pro (monospace) — reserved for data: prices, codes, timers, IDs

**Character:** A serif-on-serif pairing, deliberately not serif+sans. Gilda Display is a high-contrast, decorative display face used exclusively for headlines and the wordmark; Newsreader is a low-contrast, highly readable text serif carrying body copy and UI labels. The contrast is in weight and register — display vs. text — not in typeface family, which keeps the voice singular and literary rather than "corporate-serif-plus-utility-sans."

### Hierarchy
- **Display** (400, `clamp(2.25rem, 6vw, 6rem)`, line-height 1.1, Gilda Display): hero headlines and top-of-page h1/h2s. Never exceeds a 6rem ceiling — the system is confident, not shouting.
- **Headline** (400, 1.75–3rem, Gilda Display): section headings within a page (manifesto service titles, event page section titles).
- **Body** (400, 1rem–1.25rem, line-height 1.6, Newsreader): running copy, capped at 65–75ch (`max-w-prose`). Primary body copy uses Ink Soft (#525252), not full ink — a deliberate softening for long reads.
- **Label** (500, 0.625rem, letter-spacing 0.15em, uppercase, Newsreader): the "eyebrow" register — section labels, dates, category tags. Always uppercase, always widely tracked, always small. This is the one recurring structural device in the system; use it for genuine section labels, not as a decorative flourish on every block.
- **Mono/Data** (500, 0.875rem, Source Code Pro): prices, reservation codes, countdown timers, ticket tokens. Signals "this is a real, exact value," distinct from editorial prose.

### Named Rules
**The One Serif Family Per Role Rule.** Display text is always Gilda Display; body and label text are always Newsreader. Never substitute a sans-serif into either role — the sans imports present in the codebase (Inter) are reserved for non-brand system chrome (e.g. install prompts) and must not leak into public-facing pages.

## 4. Elevation

The resting system is flat by default: no box-shadows, no rounded corners on interactive elements, no card chrome. Structure is conveyed through whitespace, thin 1px dividers (`border-border-card` at 10% opacity), and — for imagery — a grayscale-to-full-color transition on hover, which is the system's only "reveal" gesture at rest.

Against that flatness, one deliberate exception now exists, introduced to carry the access-tiering the brand needs: gated content inverts.

### Named Rules
**The Threshold Rule.** Open, publicly-bookable content always stays flat: paper background, ink text, no border, no shadow. Content behind a threshold — a VIP-badged Session, or one carrying restrictive Admission Info ("Members only," "By invitation") — flips to an inverted block: ink background (#171717), paper text, generous internal padding (24px+), still flat (no shadow, no gradient, no glow). The inversion itself is the signal; nothing else about the component vocabulary changes. This is the system's only permitted "loud" gesture, and it means something specific — it must never be used decoratively for emphasis on open content.

**The Flat-Everywhere-Else Rule.** Outside the Threshold Rule, no component may introduce a shadow or non-zero border-radius on public pages without a specific, stated reason (the ticket confirmation card's `rounded-xl`/`shadow-mini` is the one existing exception, justified by its receipt-like, physical-object framing — not a precedent for general use).

## 5. Components

### Buttons
- **Shape:** sharp corners, no radius (`rounded-none`) — the deliberate break from the softer `--radius-button` (5px) token defined in the theme scale but not used on public-facing buttons.
- **Primary:** ink background (#171717), paper text, 12–16px vertical / 24–32px horizontal padding, medium weight label.
- **Hover:** background steps to Ink Soft (#525252); no scale, no shadow — a color-only transition.
- **Outline/Secondary:** paper background, 1px border in `border-input` (ink at 17% opacity), Ink Soft text; hover fills to Surface (#ededed).
- **Threshold variant (new):** same sharp geometry, but rendered inside an inverted block (see §4) — an ink-background button becomes a paper-background button with ink text, inverting to stay legible against the dark surface.

### Cards (Event / Talent listings)
- **Corner Style:** none — flat rectangular image with no radius.
- **Background:** paper; no border, no shadow.
- **Image treatment:** grayscale by default, transitions to full color on hover/focus (500ms) — this is the primary "liveliness" cue for browsing, replacing any card-lift or shadow interaction.
- **Divider:** a single 1px horizontal rule (`border-border-card` at ~40% opacity) between image and text block, standing in for a card boundary.
- **Internal spacing:** text block sits 16–24px below the divider; title (medium weight body), location (small, muted), date (label style, uppercase, tracked).

### Threshold Block (new — for gated content)
- **Background:** ink (#171717); text: paper (#ffffff).
- **Use:** wraps a Session's booking panel, price, or summary when the Session is VIP-badged or carries restrictive Admission Info. Not used for entire Event pages — only the specific gated element (pricing panel, CTA block), so the surrounding page stays in its normal flat-paper register.
- **Padding:** generous, 24px minimum — this block should feel deliberate and considered, not cramped.
- **Label:** the eyebrow/label style still applies inside the block, just recolored (paper text at reduced opacity for the label, full paper for the value).

### Inputs / Fields
- **Style:** flat, bordered with `border-input` (ink at 17% opacity), no fill color change at rest.
- **Focus:** border shifts to `border-input-hover` (ink at 40% opacity) plus a 2px offset ring in Ink — no glow, no color shift to an accent hue.
- **Height:** matches the `--spacing-input` (3rem) / `--spacing-input-sm` (2.5rem) tokens already defined in the theme scale.

### Navigation
- **Style:** fixed header, transparent over hero imagery (white text/logo), crossfades to a solid paper background with a bottom border once scrolled or on non-hero pages.
- **Typography:** wordmark in Gilda Display, uppercase; nav links in medium-weight body text; active link gets full ink weight (bold) rather than an underline or color accent.
- **Mobile:** slide-in drawer; active item gets a filled `surface-hover` background block with rounded corners (`rounded-lg`) — the one place rounded corners are standard, scoped to the mobile drawer's list-item affordance.

## 6. Do's and Don'ts

### Do:
- **Do** keep the resting state flat: paper background, ink text, thin dividers, zero shadow, zero radius on primary buttons and cards.
- **Do** reserve the inverted ink block exclusively for access-gated content (VIP Sessions, restrictive Admission Info) per the Threshold Rule — it must keep meaning what it means.
- **Do** use the grayscale→color image hover as the primary "alive" moment in listings, rather than introducing shadow-lift or scale-up hover effects.
- **Do** cap body copy at 65–75ch and keep the display heading ceiling at 6rem, per the house type scale.
- **Do** use Source Code Pro exclusively for real data values (prices, codes, timers) so its appearance itself signals "this number is exact."

### Don't:
- **Don't** build generic ticketing/events-platform layouts: no dense thumbnail card grids, no marketplace-style badge clutter, no promotional ribbons on every listing (per PRODUCT.md's anti-references).
- **Don't** introduce the corporate SaaS aesthetic anywhere on public pages: no startup-cream backgrounds, no hero-metric stat blocks, no dashboard-style chrome.
- **Don't** add shadows or rounded corners to buttons or event cards outside the one stated ticket-confirmation exception — flatness is the default, not a placeholder waiting to be "finished."
- **Don't** use the inverted Threshold block for emphasis on open, non-gated content — that collapses the one signal that currently distinguishes access tiers.
- **Don't** use amber or crimson decoratively (section accents, badge fills, hover glows) — they are reserved, single-purpose functional colors.
- **Don't** substitute a sans-serif into the display or body role; Inter stays confined to non-brand system UI (e.g. the iOS install prompt).

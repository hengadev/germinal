# Germinal

## Design Context

See `PRODUCT.md` and `DESIGN.md` at the repo root before making any UI/UX changes to the public site.

- **Register:** brand (the public site — events, talents, manifesto, booking — is editorial/marketing-led; `(admin)`/`(staff)` are separate product-register surfaces not covered by these docs).
- **Platform:** web (SvelteKit).
- **North Star:** "The Editorial Sanctuary" — calm, restrained, near-monochrome (ink/paper), flat by default (no shadows, no rounded corners on public pages), serif-forward typography (Gilda Display for display, Newsreader for body/label).
- **The Threshold Rule:** the one deliberate exception to flatness — access-gated content (VIP-badged Sessions, restrictive Admission Info) inverts to an ink background/paper text block. Never use this inversion decoratively on open content.
- Anti-references: no generic ticketing-platform card grids, no corporate SaaS aesthetic (cream backgrounds, hero-metric sections, dashboard chrome) on public pages.

Run `/impeccable` for the full command set (craft, critique, audit, polish, live, etc.).

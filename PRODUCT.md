# Product

## Register

brand

## Platform

web

## Users

Two audiences share the public site. The primary is a prospective guest discovering an Event (a dinner, performance, or workshop) and deciding whether to reserve a Session — someone weighing whether this is worth their evening and their money. The secondary is a prospective collaborator: an artist considering joining the Talent roster, a venue or partner considering co-producing an Event, or someone commissioning Germinal to organize something. Both audiences are persuaded by the same evidence — curatorial taste, the standing roster, the editorial voice — read through different lenses.

## Product Purpose

The public site exists to convert curiosity into bookings while doing double duty as a portfolio: every page is proof of Germinal's taste and curation, which is what generates inbound interest from collaborators, venues, and commissioners. Success is bookings plus reputation — a visitor who doesn't book today should still leave believing Germinal is a studio worth watching, worth reaching out to, worth returning to when the next Spotlight lands.

## Positioning

Germinal curates bespoke, intimately-scaled cultural experiences end-to-end — art direction, scenography, guest experience — not a listings or ticketing platform. The manifesto's own structure (art direction, scenography, as numbered services) is the product pitch: curation is the product, not the byproduct.

## Conversion & proof

- Primary CTA: view the Spotlight event (the single currently-promoted Event, driving from homepage attention toward a specific booking decision)
- Secondary CTA: join the waitlist / get notified, for visitors not ready to book right now
- The line a visitor remembers after 10 seconds: "This is a studio worth watching."
- Belief ladder: (1) Germinal has real curatorial taste, evidenced by the manifesto and the standing Talent roster → (2) this specific Event is rare and intimate — capacity is deliberately controlled, never mass-market → (3) acting (viewing the Spotlight, joining the waitlist) is quick and low-friction
- Proof on hand: none yet. The site currently relies on structural proof — Collaborators and Curator fields on each Event — rather than external testimonials, press, or logos.

## Brand Personality

Refined, restrained, editorial — with an edge. Quiet confidence rather than salesmanship — the voice of a magazine profiling a studio, not a platform pitching a service — but not purely calm: Germinal is professional and precise, with real cultural currency, and comfortable being selective. Access isn't uniform — some sessions are open to everyone, others (VIP-badged, or carrying restrictive Admission Info like "Members only" or "By invitation") are for a smaller circle — and the brand should let that distinction show rather than flattening every event into the same welcoming tone. Generous whitespace, serif display type carrying the emotional weight, muted uppercase eyebrows for structure. No specific external references were named; the existing manifesto and public pages (large serif headings, `text-foreground-alt` body copy, numbered service sections, `fade-up`/`fade-down` reveal motion) are themselves the anchor going forward — new work should extend that voice, not reinvent it.

## Anti-references

Not a generic ticketing/events platform: no thumbnail card grids, no marketplace density, no promotional badges scattered across every listing. Not a corporate SaaS aesthetic either: no startup-cream backgrounds, no hero-metric sections, no "modern web app" dashboard look bleeding into the public-facing pages. This is a cultural brand being read, not a product being adopted.

## Design Principles

- Curation over cataloguing: every list (Events, Talents) should read as hand-picked, not browsed — resist the pull toward dense, scannable marketplace grids.
- Show, don't badge: taste is demonstrated through editorial writing and imagery (manifesto's art direction/scenography sections), not through trust badges or metric callouts.
- Scarcity is structural, not decorative: capacity limits and the single-Spotlight rule are real constraints (Sessions always have capacity; only one Spotlight at a time) — let the design reflect genuine intimacy rather than manufacturing urgency with countdown-timer tropes.
- Access is not uniform: some Sessions (VIP-badged, or carrying restrictive Admission Info such as "Members only") are for a smaller circle than others — these are currently editorial labels, not enforced access rules. The design should let that distinction be visible and deliberate rather than presenting every event with identical, universally-welcoming treatment.
- One voice across the funnel: the same restrained, serif-led editorial register that carries the manifesto should carry through discovery, booking, and confirmation (tickets) — a guest shouldn't feel like they've left the magazine and entered a checkout app.
- Practice what you preach: since the site itself is the primary proof of curatorial taste, its own execution (typography, spacing, motion) is not decoration — it is the argument.

## Accessibility & Inclusion

Standard WCAG 2.1 AA. Reduced-motion alternatives are already respected in `app.css` (`prefers-reduced-motion` disables `.animate-reveal` and `.animate-fade-pulse`) — new motion work must preserve that pattern.

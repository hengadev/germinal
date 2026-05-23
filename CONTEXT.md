# Germinal

Germinal is a creative studio that curates and organizes bespoke cultural experiences (dinners, performances, workshops) and maintains a public roster of artists it works with regularly.

## Language

### Experiences & Programming

**Event**:
A curated experience organized by Germinal (e.g., a chef's dinner, a performance, a workshop). Has a date range and one or more Sessions.
_Avoid_: Show, experience, programme

**Session**:
A specific, bookable time slot within an Event (e.g., a lunch service or an evening dinner). The unit of reservation — guests book a Session, not an Event. Every Event must have at least one Session before it can be published. Free events use a Session with price = 0; there is no such thing as a sessionless published Event.
_Avoid_: Slot, occurrence, time slot

**Badge**:
A marketing label applied to a Session to highlight it on the booking UI. Purely display — has no effect on pricing or access rules. Options: `featured`, `vip`, `popular`, `best_value`, `limited`. A Session has at most one Badge (or none).
_Avoid_: Tag, label, tier

**Spotlight**:
The single upcoming Event currently promoted on the homepage and its own dedicated page, excluded from the regular Events listing. There is always at most one Spotlight at a time — enforced by convention, not by a database constraint.
_Avoid_: Featured event, hero event

**Collaborator**:
A person or organization contributing to a specific Event. Stored as a structured list of `{name, role}` entries on the Event (e.g., "Maison Dupont — Partner Venue", "Chef Laurent — Guest Chef"). Rendered as an "In collaboration with" block on the public Event page.
_Avoid_: Partner, contributor

**Curator**:
The person responsible for the artistic or editorial direction of a specific Event, displayed as a plain text label on the Event detail page.
_Avoid_: Organizer, director

**Timings**:
An editorial schedule displayed on the Event page alongside the venue info (e.g., "Doors: 7:00pm", "Dinner: 8:30pm"). Stored as a structured list of `{label, time}` entries. Complements Session start/end times with human-readable programme detail.
_Avoid_: Schedule, programme, agenda

**Admission Info**:
Optional supplementary text displayed alongside session pricing on the Event page. Used for access conditions not captured by price alone (e.g., "Members only", "By invitation"). Purely editorial — has no effect on the booking flow.
_Avoid_: Access conditions, entry requirements

### Talent

**Talent**:
A recurring artist or creative professional on Germinal's curated roster. Exists independently of Events — represents Germinal's ongoing relationships with artists.
_Avoid_: Artist, creator, performer

### Booking Flow

**Reservation**:
The record created when a guest books one or more seats for a Session. Holds guest identity, quantity, payment status, and an access token. One Reservation may cover multiple seats.
_Avoid_: Booking (use as a verb only), order, purchase

**Ticket**:
The confirmation document a guest receives after a Reservation is confirmed. One Ticket per Reservation (not per seat), identified by a unique QR code linking to `/tickets/[token]`.
_Avoid_: Pass, voucher, confirmation

**Guest**:
A person who makes a Reservation, identified by email and name. Does not require an account — Reservations are guest-first and accessed via token, not login.
_Avoid_: Customer, user, attendee

**Waitlist**:
A queue a guest can join when a Session is at full capacity. Scoped to a Session, with an expiry date.
_Avoid_: Queue, backlog

**Promo Code**:
A user-facing discount code entered at checkout. Backed by a Coupon that defines the discount logic. One Coupon can have many Promo Codes.
_Avoid_: Discount code, voucher code

**Coupon**:
The internal discount rule (percent or fixed amount) attached to an Event. Not directly visible to guests — they interact with Promo Codes.
_Avoid_: Discount, offer

### People & Access

**Admin**:
A member of the Germinal internal team with full back-office access (event management, reservations, analytics, team). Operates from the admin subdomain.
_Avoid_: Manager, operator

**Staff**:
An external person (e.g., bartender, photographer, technician) assigned to a specific Event. Has a minimal portal for viewing and completing their assigned Tasks only.
_Avoid_: Team member, crew, volunteer

**Task**:
An operational to-do item scoped to an Event, assigned to a Staff member by an Admin.
_Avoid_: To-do, action item

**User** (role):
A registered visitor account. Not actively used — Guests make Reservations without accounts. The role exists as a forward-looking affordance for potential future member features.
_Avoid_: Member, account holder

### Contact & Inquiries

**Inquiry**:
A contact form submission from an external party. Four types: `collaboration` (co-producing an event), `new_project` (commissioning Germinal to organize something), `join_roster` (applying to become a Talent), `other`.

## Relationships

- An **Event** has one or more **Sessions**
- A **Session** belongs to exactly one **Event**
- A **Guest** makes a **Reservation** for a **Session** (no account required)
- A **Reservation** produces one **Ticket** (one QR code, regardless of seat quantity)
- A **Coupon** belongs to an **Event** and has one or more **Promo Codes**
- A **Talent** belongs to Germinal's roster independently of any specific **Event**
- A **Collaborator** is referenced on an **Event** but is not a **Talent** in the system
- An **Admin** can assign a **Staff** member to an **Event** via a role label
- An **Admin** creates **Tasks** on an **Event** and assigns them to **Staff**

## Example dialogue

> **Dev:** "We have a chef dinner coming up — it's free for invited guests. Do we still need a Session?"
> **Domain expert:** "Yes — always. Create a Session with price = 0. We still need capacity control; Germinal events are intimate."

> **Dev:** "The chef is on our Talent roster. Should I link the Talent to the Event in the database?"
> **Domain expert:** "No. Add them as a Collaborator on the Event — name and role. Talents are the standing roster, not per-event participants."

> **Dev:** "Someone submitted an inquiry saying they want to host a dinner with us. Which type is that?"
> **Domain expert:** "That's `new_project` — they're commissioning us to organise something. `collaboration` is when an external party wants to co-produce alongside us."

## Deprecated fields

- `materialsEn` / `materialsFr` on Event: no defined use case — to be removed from schema, admin form, and public page.

## Legal & Compliance

**Privacy Contact**: `privacy@germinalstudio.co` — the designated data controller contact for GDPR/RGPD inquiries. Referenced in the privacy policy. Must be set up as a forwarding alias before go-live.

**Legal entity**: Germinal. Registered address: _TODO — to be filled before publishing legal pages._

## Flagged ambiguities

- **Collaborator vs Talent**: a Talent is a standing roster member; a Collaborator is a named contributor on a specific Event. These are distinct and must not be conflated.
- **Spotlight uniqueness**: only one Event should have `isSpotlight = true` at a time. Enforced at the service layer (`createEvent` / `updateEvent` clear all other spotlights before setting the new one). Not enforced at the DB level — a direct SQL write could bypass this.
- **User role**: the `user` role exists in the schema but no Guest registration flow exists yet. A `Guest` making a Reservation is not the same as a `User`.

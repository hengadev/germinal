# Germinal

Germinal is a creative studio that curates and organizes bespoke cultural experiences (dinners, performances, workshops) and maintains a public roster of artists it works with regularly.

## Language

### Experiences & Programming

**Event**:
A curated experience organized by Germinal (e.g., a chef's dinner, a performance, a workshop). Takes place over one or more Days; its date span runs from its first to its last Day.
_Avoid_: Show, experience, programme

**Day**:
A calendar date on which an Event takes place. An Event's Days are picked individually and need not be consecutive (e.g., Monday, Wednesday, Thursday).
_Avoid_: Date range, occurrence

**Service**:
A meal on a given Day — either lunch (déjeuner) or dinner (dîner). A Day has a lunch Service, a dinner Service, or both. Services are meal-only for now; non-meal formats (workshop, performance) are a deliberate later extension.
_Avoid_: Meal option, repas, sitting

**Seating**:
A sitting within a Service, with a start and an end time (e.g., Wednesday lunch 12:00–13:15, then 13:30–14:45). Each Seating holds its own capacity: guests of one Seating leave before the next one arrives, so the venue fills up once per Seating. The unit of reservation — guests book a Seating, not an Event. Every Event must have at least one Seating before it can be published.
_Avoid_: Session (former name), slot, créneau, turn

**Menu**:
A set of dishes served at an Event, described once and offered on one or more Services (e.g., the same Menu at lunch and dinner, or on every Day). Its price is set per Service that offers it, so lunch and dinner can charge differently for the same Menu. A Service offers at most one Menu, so the Guest has no choice to make; offering several Menus with a per-seat choice is a deliberate later extension.
_Avoid_: Formula, formule, offer

**Deposit**:
The part of a Menu's price a Guest pays online when making a Reservation; the remainder (the **Balance**) is paid at the venue. Defined once per Event as either a fixed amount per seat or a percentage of each price, and always displayed as the resulting amount. An Event may require no Deposit, in which case the Guest pays everything at the venue.
_Avoid_: Acompte (in code/docs), down payment, pre-payment

**Balance**:
What a Guest still owes at the venue: the price minus the Deposit already paid.
_Avoid_: Remainder, solde (in code/docs)

**Refund Policy**:
The rule deciding whether a Guest who cancels gets their Deposit back, chosen by the Admin per Event. Either **manual** (a free-text statement; each refund is decided by an Admin) or **rule-based** (one or more tiers such as "100% refunded until 48h before the Seating, then 0%"; "always refundable" and "never refundable" are single-tier presets). Whatever the policy, when Germinal cancels a Seating or an Event every Deposit is refunded in full, and an Admin may always refund as a goodwill gesture.
_Avoid_: Cancellation policy, conditions d'annulation (in code/docs)

**Venue Capacity**:
The number of guests the Event's venue holds at once. Set once per Event and inherited by every Seating, which may override it (e.g., a smaller chef's table on one dinner). A Seating's capacity can never drop below the seats already reserved.
_Avoid_: Max guests, covers

**Time Zone**:
The local time of the Event's venue (e.g., Europe/Paris, Europe/London). Set once per Event; every Seating time is entered and displayed in it, whoever is looking and wherever they are. A Seating's Day and whether it falls at lunch or dinner are read in this local time.
_Avoid_: Fuseau (in code/docs), UTC times, local time (ambiguous)

**Badge**:
A marketing label applied to a Seating to highlight it on the booking UI. Purely display — has no effect on pricing or access rules. Options: `featured`, `vip`, `popular`, `best_value`, `limited`. A Seating has at most one Badge (or none).
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
An editorial schedule displayed on the Event page alongside the venue info (e.g., "Doors: 7:00pm", "Dinner: 8:30pm"). Stored as a structured list of `{label, time}` entries. Complements Seating start/end times with human-readable programme detail.
_Avoid_: Schedule, programme, agenda

**Admission Info**:
Optional supplementary text displayed alongside pricing on the Event page. Used for access conditions not captured by price alone (e.g., "Members only", "By invitation"). Purely editorial — has no effect on the booking flow.
_Avoid_: Access conditions, entry requirements

### Talent

**Talent**:
A recurring artist or creative professional on Germinal's curated roster. Exists independently of Events — represents Germinal's ongoing relationships with artists.
_Avoid_: Artist, creator, performer

### Booking Flow

**Reservation**:
The record created when a guest books one or more seats for a Seating. Holds guest identity, quantity, payment status, and an access token. One Reservation may cover any number of seats, limited only by the Seating's remaining capacity — there is deliberately no per-Reservation cap.
_Avoid_: Booking (use as a verb only), order, purchase

**Ticket**:
The confirmation document a guest receives after a Reservation is confirmed. One Ticket per Reservation (not per seat), identified by a unique QR code linking to `/tickets/[token]`.
_Avoid_: Pass, voucher, confirmation

**Guest**:
A person who makes a Reservation, identified by email and name. Does not require an account — Reservations are guest-first and accessed via token, not login.
_Avoid_: Customer, user, attendee

**Waitlist**:
A queue a guest can join when a Seating is at full capacity. Scoped to a Seating, with an expiry date.
_Avoid_: Queue, backlog

**Promo Code**:
A user-facing discount code entered at checkout. Backed by a Coupon that defines the discount logic. One Coupon can have many Promo Codes. The discount applies to the price of the meal, not to the Deposit: the Deposit is then worked out on the discounted price (and never exceeds it), and the Balance shrinks accordingly.
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

- An **Event** has one or more **Days**
- A **Day** has a lunch **Service**, a dinner **Service**, or both
- A **Service** has one or more **Seatings**
- A **Menu** is described once per **Event** and offered on one or more **Services**, each setting its own price
- A **Service** offers at most one **Menu**
- An **Event** has exactly one **Deposit** rule (possibly none) and one **Refund Policy**
- A **Guest** makes a **Reservation** for a **Seating** (no account required)
- A **Reservation** produces one **Ticket** (one QR code, regardless of seat quantity)
- A **Coupon** belongs to an **Event** and has one or more **Promo Codes**
- A **Talent** belongs to Germinal's roster independently of any specific **Event**
- A **Collaborator** is referenced on an **Event** but is not a **Talent** in the system
- An **Admin** can assign a **Staff** member to an **Event** via a role label
- An **Admin** creates **Tasks** on an **Event** and assigns them to **Staff**

## Example dialogue

> **Dev:** "The client wants Monday and Wednesday dinners, two sittings each, same tasting menu at €65 with a €20 deposit. How many Seatings is that?"
> **Domain expert:** "Four — two Days, one dinner Service each, two Seatings per Service. The Menu is described once and offered on both Services. Each Seating gets the Venue Capacity unless we override it."

> **Dev:** "A guest used a 10% promo code. What do they still owe at the door?"
> **Domain expert:** "The Balance: the discounted price minus the Deposit they paid online. Staff see it at check-in."

> **Dev:** "We have a chef dinner coming up — it's free for invited guests. Do we still need a Seating?"
> **Domain expert:** "Yes — always. Create a Seating with price = 0. We still need capacity control; Germinal events are intimate."

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

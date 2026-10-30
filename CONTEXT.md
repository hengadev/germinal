# Germinal

Germinal is a creative studio that curates and organizes bespoke cultural experiences (dinners, performances, workshops) and maintains a public roster of artists it works with regularly.

## Language

### Experiences & Programming

**Event**:
A curated experience organized by Germinal (e.g., a chef's dinner, a performance, a workshop). Takes place over one or more Days; its date span runs from its first to its last Day.
_Avoid_: Show, experience, programme

**Day**:
A calendar date on which an Event takes place. An Event's Days are picked individually and need not be consecutive (e.g., Monday, Wednesday, Thursday). On the day, a Day runs from midnight to 6 a.m. the next morning in the Event's **Time Zone**, so a dinner past midnight stays on its Day: this is the window in which **Staff** see that Day's guests and record **Check-ins**.
_Avoid_: Date range, occurrence

**Service**:
A meal on a given Day — either lunch (déjeuner) or dinner (dîner). A Day has a lunch Service, a dinner Service, or both. Services are meal-only for now; non-meal formats (workshop, performance) are a deliberate later extension.
_Avoid_: Meal option, repas, sitting

**Seating**:
A sitting within a Service, with a start and an end time (e.g., Wednesday lunch 12:00–13:15, then 13:30–14:45). Each Seating holds its own capacity: guests of one Seating leave before the next one arrives, so seats are put on sale once per Seating. The unit of reservation — guests book a Seating, not an Event, so an Event without Seatings can be announced but not booked.
_Avoid_: Session (former name), slot, créneau, turn

**Menu**:
A set of dishes served at an Event, described once and offered on one or more Services (e.g., the same Menu at lunch and dinner, or on every Day). Its price is set per Service that offers it, so lunch and dinner can charge differently for the same Menu. A Service offers at most one Menu, so the Guest has no choice to make; offering several Menus with a per-seat choice is a deliberate later extension.
_Avoid_: Formula, formule, offer

**Course**:
One step of a Menu, in the order it is served (e.g., « Entrée », « Plat », « Dessert »): a label and what is served — one dish, or several the guest chooses from at the table (not at booking). A Menu is its ordered Courses plus an optional note (wine pairing, allergens). The label may be left blank; a Course with no dish is not kept.
_Avoid_: Step (UI wording only: « étape »), dish, plat

**Deposit**:
The part of a Menu's price a Guest pays online when making a Reservation; the remainder (the **Balance**) is paid at the venue. Defined once per Event as either a fixed amount per seat or a percentage of each price, and always displayed as the resulting amount. An Event may require no Deposit, in which case the Guest pays everything at the venue, or a Deposit of 100%, in which case everything is paid online and there is no Balance. Which one is the Admin's call per Event, not the app's: the app supports all three. Whatever Guests consume on site beyond the Menu (drinks, extras) is not a Reservation's business and is never recorded in the app.
_Avoid_: Acompte (in code/docs), down payment, pre-payment

**Balance**:
What a Guest still owes at the venue: the price minus the Deposit already paid. Collected on the venue's payment terminal, never through the app. Once collected, a **Staff** member marks it **settled**, attributed to them: this records no amount and no payment method (the terminal's report is the accounting for money taken on site); it only tells the team the party owes nothing more. Undoing it takes the "correct a mistake" **Staff Permission** or an **Admin**.
_Avoid_: Remainder, solde (in code/docs)

**Refund Policy**:
The rule deciding whether a Guest who cancels gets their Deposit back, chosen by the Admin per Event. Either **manual** (a free-text statement; each refund is decided by an Admin) or **rule-based** (one or more tiers such as "100% refunded until 48h before the Seating, then 0%"; "always refundable" and "never refundable" are single-tier presets). Whatever the policy, when Germinal cancels a Seating or an Event every Deposit is refunded in full, and an Admin may always refund as a goodwill gesture.
_Avoid_: Cancellation policy, conditions d'annulation (in code/docs)

**Venue Capacity**:
The number of seats put on sale for each Seating — the Admin's limit, not the size of the room: it may exceed the room to absorb no-shows. Set once per Event and inherited by every Seating, which may override it (e.g., a smaller chef's table on one dinner). Optional: left blank, inheriting Seatings take any number of Reservations and are never full (ADR 0009). A Seating's capacity can never drop below the seats already reserved.
_Avoid_: Max guests, covers

**Time Zone**:
The local time of the Event's venue (e.g., Europe/Paris, Europe/London). Set once per Event; every Seating time is entered and displayed in it, whoever is looking and wherever they are. A Seating's Day and whether it falls at lunch or dinner are read in this local time.
_Avoid_: Fuseau (in code/docs), UTC times, local time (ambiguous)

**Badge**:
A marketing label applied to a Seating to highlight it on the booking UI. Purely display — has no effect on pricing or access rules. Options: `featured`, `vip`, `popular`, `best_value`, `limited`. A Seating has at most one Badge (or none).
_Avoid_: Tag, label, tier

**Visibility**:
Who can see and book an Event. **Draft**: Admins only, who can preview its public page. **Private**: anyone holding its link can see and book it, but it is never listed, never indexed by search engines and never the Spotlight (e.g., a dinner commissioned by a brand for its guests). **Public**: anyone can see and book it, and it may be the Spotlight. Taking an Event out of Draft is publishing it.
_Avoid_: Published/unpublished (as a state), unlisted, hidden, status

**Spotlight**:
The single upcoming Public Event promoted on the homepage and its own dedicated page ("Prochain événement"). Other upcoming Events are listed nowhere and reached through their link. There is always at most one Spotlight at a time — enforced by convention, not by a database constraint.
_Avoid_: Featured event, hero event

**Portfolio**:
The curated set of Events Germinal showcases as projects once they are over, listed under "Projets" and in the homepage gallery. Private and Public Events alike may join it, but only after their last Seating has started; it is meant to be shown with a Recap and Event Photos. An Event that is over and not in the Portfolio is listed nowhere.
_Avoid_: Archive, past events, gallery (the homepage block only)

**Recap**:
The text written after an Event for its Portfolio presentation, telling what took place. Once the Event is in the Portfolio, its page leads with the Recap and no longer shows the announcement text, Seatings or prices.
_Avoid_: Summary, review, compte rendu (in code/docs)

**Event Photos**:
Photos taken at the Event, added after it for its Portfolio presentation, one of them chosen as the project's cover. Distinct from the **Visuals** used to announce the Event beforehand.
_Avoid_: Gallery, media (ambiguous)

**Collaborator**:
A person or organization contributing to a specific Event. Stored as a structured list of `{name, role}` entries on the Event (e.g., "Maison Dupont — Partner Venue", "Chef Laurent — Guest Chef"). Rendered as an "In collaboration with" block on the public Event page.
_Avoid_: Partner, contributor

**Curator**:
The person responsible for the artistic or editorial direction of a specific Event, displayed as a plain text label on the Event detail page.
_Avoid_: Organizer, director

**Timings**:
An editorial schedule displayed on the Event page alongside the venue info (e.g., "Doors: 7:00pm", "Dinner: 8:30pm"). Stored as a structured list of `{label, time}` entries. Complements Seating start/end times with human-readable programme detail.
_Avoid_: Schedule, programme, agenda

**Practical Info**:
What a Guest needs on the day: arrival instructions, door code, dress code, a contact to call. Written per Event (EN/FR) and given only to Guests holding a Ticket — on the Ticket and in their emails, never on the public Event page.
_Avoid_: Access info, infos pratiques (in code/docs), Admission Info (which is public)

**Internal Notes**:
Free text on an Event that only Admins ever see (venue contact, client, budget). Never shown to Guests or Staff.
_Avoid_: Comments, memo

**Admission Info**:
Optional supplementary text displayed alongside pricing on the Event page. Used for access conditions not captured by price alone (e.g., "Members only", "By invitation"). Purely editorial — has no effect on the booking flow.
_Avoid_: Access conditions, entry requirements

### Talent

**Talent**:
A recurring artist or creative professional on Germinal's curated roster. Exists independently of Events — represents Germinal's ongoing relationships with artists.
_Avoid_: Artist, creator, performer

### Booking Flow

**Reservation**:
The record created when a guest books one or more seats for a Seating. Holds guest identity, quantity, payment status, and an access token. One Reservation may cover several seats, up to the Seating's remaining capacity. On an Event without a Deposit it is also capped per Event (10 seats by default, set by the Admin); on an Event with a Deposit there is no cap. Comps an Admin issues ignore the cap.
_Avoid_: Booking (use as a verb only), order, purchase

**Move**:
Changing a **Reservation**'s **Seating**. A **Staff** member may only move one, during a **Day**, to another Seating of the same **Service** (e.g. dinner 19:00 → 21:00): same **Menu**, same price, so nothing paid or owed changes. The target Seating's capacity may be exceeded, as for a **Walk-in**. The **Ticket** keeps working, since it belongs to the Reservation. The Guest gets a "Réservation modifiée" email with the new time when they have an email. Attributed to whoever made it. Moving to another Service or another Day may change the price, so it is an **Admin**'s, with the price difference handled (not built yet), and moving to another Day is subject to the terms of sale.
_Avoid_: Transfer, reschedule, change (as a noun)

**No-show**:
A **Guest** of a **Reservation** for a **Seating** that is over who was never checked in: a party of 4 with 3 arrived counts 1 No-show. Shown to **Admins** in each Seating's attendance once the Event is over, beside the Guests booked and arrived, the **Walk-ins** and the **Comps**, to help set the next Event's capacity.
_Avoid_: Absent, missing

**Walk-in**:
A **Reservation** a **Staff** member or **Admin** makes on the spot, during a **Day**, for a party that turns up without booking. It takes no Deposit, so its **Balance** is the full price, collected on the terminal and then settled like any other. Asks only a name and party size (email and phone optional), sends no **Ticket**, and is checked in as soon as it is made. Attributed to whoever made it. May exceed the **Seating**'s capacity: that capacity limits online sales, and the person at the door sees the room; the guest list then shows the overflow (e.g. "34 / 32").
_Avoid_: Drop-in, sur place (in code/docs)

**Comp**:
A **Reservation** offered for free: no Deposit, no **Balance**. Made by an **Admin**, or on the spot by a **Staff** member whose **Assignment** grants the "offer a Comp" **Staff Permission** (never in a starting Staff Role; an Admin grants it to people they trust). A Comp made on the spot behaves like a **Walk-in** otherwise: no Ticket, checked in at once, attributed, may exceed capacity.
_Avoid_: Invitation, free ticket, offert (in code/docs)

**Cancelled**:
A Seating or an Event that Germinal called off. Its Reservations are cancelled with every Deposit refunded in full and its Guests notified; it takes no new Reservations or Waitlist entries. A cancelled Event stays reachable at its link, marked as cancelled, but is never listed, Spotlight or Portfolio. An Event whose every Seating is cancelled is cancelled.
_Avoid_: Annulled, called off (in code/docs)

**Dietary Requirements**:
Allergies or a diet a Guest declares when booking, for the whole Reservation, on Events that ask for them. Health data: given only with the Guest's explicit consent, seen only by Admins, and erased 30 days after the Seating.
_Avoid_: Allergies (as the field name), dietary notes, régime (in code/docs)

**Ticket**:
The confirmation document a guest receives after a Reservation is confirmed. One Ticket per Reservation (not per seat), identified by a unique QR code linking to `/tickets/[token]`.
_Avoid_: Pass, voucher, confirmation

**Check-in**:
The record that some of a **Reservation**'s **Guests** have arrived: how many, when, and which **Staff** member or **Admin** recorded it. Counts Guests, not parties: a party of 4 arriving in two halves is two Check-ins, and the Reservation reads "2 / 4 arrived" in between. A Reservation's Check-ins never add up to more than its party size. Made by scanning the **Ticket** (pre-filled with the Guests still expected) or by hand, and only during its **Seating**'s **Day** (midnight to 6 a.m. the next morning, in the Event's **Time Zone**): a Ticket shown on another day is refused. A Guest who wants to come on another day needs their Reservation moved first (the conditions for that belong in the terms of sale). A Check-in can be undone by someone with the "correct a mistake" **Staff Permission**, or an **Admin**.
_Avoid_: Scan, entry, admission, arrival (as a noun for the record)

**Guest**:
A person who makes a Reservation, identified by email and name (a **Walk-in** or a **Comp** made on the spot may have no email). Does not require an account — Reservations are guest-first and accessed via token, not login.
_Avoid_: Customer, user, attendee

**Booking Window**:
The period during which a Seating can be booked. Set once per Event: it opens at a chosen moment (by default as soon as the Event is published) and closes a chosen number of hours before each Seating starts (by default at its start). Before it opens, Guests see the Seatings and prices and when booking opens, but cannot book.
_Avoid_: Sales period, booking period, ouverture des ventes (in code/docs)

**Waitlist**:
A queue a guest can join when a Seating is at full capacity, only while its Booking Window is open. Scoped to a Seating, with an expiry date; it stops, and its entries expire, when the Seating's Booking Window closes.
_Avoid_: Queue, backlog

**Promo Code**:
A user-facing discount code entered at checkout. Backed by a Coupon that defines the discount logic. One Coupon can have many Promo Codes. The discount applies to the price of the meal, not to the Deposit: the Deposit is then worked out on the discounted price (and never exceeds it), and the Balance shrinks accordingly.
_Avoid_: Discount code, voucher code

**Coupon**:
The internal discount rule (percent or fixed amount) attached to an Event. Not directly visible to guests — they interact with Promo Codes.
_Avoid_: Discount, offer

### People & Access

**Admin**:
A member of the Germinal internal team with full back-office access (event management, reservations, analytics, team). Operates from the admin subdomain. May also use the **Staff** portal to follow an Event on the day: there they hold every **Staff Permission** at every Event, without an **Assignment**, and what they do is attributed to them like any Staff member's.
_Avoid_: Manager, operator

**Staff**:
An external person (e.g., bartender, photographer, technician) with an **Assignment** to an Event. Has a portal showing, for each Assignment, only what its **Staff Permissions** allow. On the day, acts from their own phone, logged in as themselves: every Check-in or change they make is attributed to them. There is no shared door device. The portal is in French only, like the admin.
_Avoid_: Team member, crew, volunteer

**Assignment**:
A **Staff** member's place on one **Event**, with one **Staff Role**. A Staff member has at most one Assignment per Event. What they may do at that Event is the Staff Role's **Staff Permissions**, plus any granted and minus any withdrawn on this Assignment alone. These adjustments express trust in this person for this Event; they never carry over to another Event.
_Avoid_: Staffing, booking (of staff)

**Staff Role**:
A named set of **Staff Permissions** an **Admin** creates and edits (e.g. Door, Bar, Photographer, or "Door (senior)" for trusted people). An **Assignment** refers to it: editing a Staff Role changes the permissions of every Assignment to it at once, while each Assignment keeps its own adjustments. Starts seeded with Responsable, Porte, Salle, Cuisine, Bar and Photographe, all editable. A Staff Role is never deleted while an Assignment refers to it, only archived: it keeps working on those Assignments but can no longer be picked for a new one.
_Avoid_: Role (alone: that is an account's admin/staff/user role), position, job

**Staff Permission**:
One thing a **Staff** member may do or see at an **Event** (e.g. see the guest list, check Guests in, see **Dietary Requirements**). The list is fixed in the code; Admins combine permissions into **Staff Roles** and adjust them per **Assignment**. The list (may grow after client feedback):
- see the Event's **Tasks** and update their status
- see the guest list (names, party size, **Seating**, **Balance** due)
- check Guests in by scanning their **Ticket**
- check Guests in by hand, without a Ticket (found by name)
- mark a **Balance** as settled
- correct a mistake: undo a Check-in or a settled Balance (for trusted people; among the starting Staff Roles, only Responsable holds it)
- see **Dietary Requirements** (health data)
- see Guests' contact details (phone, email)
- **Move** a Reservation to another Seating of the same Service
- add a **Walk-in**
- offer a **Comp** (never in a starting Staff Role: an Admin grants it per Assignment)

Every permission but the Tasks one concerns Guests, and works only during a **Day** of the Event, on that Day's Reservations alone: before it, after it, or for another Day, a Staff member sees no Guest at all, whatever their Staff Role. Guests' data is needed on the day, never before.

Acting on parties (scanning, checking in by hand, settling a Balance, a Move, a Walk-in, a Comp) requires seeing the guest list, so granting one grants that too. Seeing Dietary Requirements shows each party's name and size with them, not the whole guest list.

Never a Staff Permission, whatever the trust: cancelling or refunding a Reservation, and seeing **Internal Notes**. Those stay with Admins.
_Avoid_: Right, access, capability

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
- An **Event** has one **Visibility** and one **Time Zone**
- An **Event** may join the **Portfolio** once it is over; it is shown there with its **Recap** and **Event Photos**
- A **Guest** makes a **Reservation** for a **Seating** (no account required)
- A **Reservation** produces one **Ticket** (one QR code, regardless of seat quantity)
- A **Coupon** belongs to an **Event** and has one or more **Promo Codes**
- A **Talent** belongs to Germinal's roster independently of any specific **Event**
- A **Collaborator** is referenced on an **Event** but is not a **Talent** in the system
- An **Admin** gives a **Staff** member an **Assignment** to an **Event**, with one **Staff Role**
- A **Staff Role** has zero or more **Staff Permissions**; an **Assignment** may grant or withdraw some
- An **Admin** creates **Tasks** on an **Event** and assigns them to **Staff**

## Example dialogue

> **Dev:** "The client wants Monday and Wednesday dinners, two sittings each, same tasting menu at €65 with a €20 deposit. How many Seatings is that?"
> **Domain expert:** "Four — two Days, one dinner Service each, two Seatings per Service. The Menu is described once and offered on both Services. Each Seating gets the Venue Capacity unless we override it."

> **Dev:** "A guest used a 10% promo code. What do they still owe at the door?"
> **Domain expert:** "The Balance: the discounted price minus the Deposit they paid online. Staff see it at check-in."

> **Dev:** "We have a chef dinner coming up — it's free for invited guests. Do we still need a Seating?"
> **Domain expert:** "Yes — guests can only book a Seating. Set the Service's price to 0. With no Deposit some invitees won't show, so put a few more seats on sale than the room holds — or leave the capacity blank if anyone invited may come."

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

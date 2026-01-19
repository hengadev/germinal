You are working on a **SvelteKit application using Drizzle ORM (PostgreSQL)**.
The existing database schema is provided in @src/lib/server/db/schema.ts.

Your task is to **design a complete reservation and ticketing system** that integrates **Stripe payments**, **without adding public user accounts**.

⚠️ **Do NOT write implementation code**.
You must output a **detailed, step-by-step implementation plan**.

---

## 🔒 Authentication & Identity Constraints (VERY IMPORTANT)

* The app already has authentication for **admin users only** (`users`, `sessions`)
* **Event attendees must NOT be required to create accounts**
* Reservations are **guest-based**
* Identity is handled via:

  * Email (required)
  * Name (required)
  * Optional phone number
* Ticket access must be handled via **secure, unguessable access tokens**
* You MAY include a nullable `user_id` on reservations **only for future use**, but it must not be required or used now

---

## 🧠 Domain Model (must follow exactly)

* **Event** → already exists
* **Event Slot** (also called service/session — you must choose ONE term and justify it)

  * Represents a single reservable time window
  * Has its own capacity and price
* **Reservation**

  * Always linked to an event slot
  * Never directly to an event
* **Payment**

  * Stripe-backed
  * Linked to a reservation

---

## 🎯 Your deliverables

### 1️⃣ Database & schema design (Drizzle / Postgres)

Propose:

* New tables
* New enums if needed
* Foreign keys & relations
* Indexes
* Constraints (capacity, uniqueness, integrity)

You MUST cover:

* `event_slots` (or chosen name)
* `reservations`
* `payments`

For each table:

* Explain its purpose
* Explain why each field exists
* Clarify which fields are source-of-truth vs derived
* Ensure the design supports **guest reservations**

---

### 2️⃣ Reservation lifecycle (end-to-end)

Describe the full lifecycle:

1. Visitor selects an event
2. Visitor selects a slot
3. Availability is checked
4. Stripe PaymentIntent is created
5. Reservation is created in a pending state
6. Payment confirmation via Stripe
7. Reservation is confirmed
8. Ticket email is sent
9. Failure, cancellation, timeout, and refund flows

You MUST explain:

* When capacity is locked vs decremented
* How race conditions are avoided
* What happens if payment is abandoned
* How idempotency is handled

---

### 3️⃣ Stripe integration (architecture only)

Explain:

* Which Stripe objects are used (PaymentIntent, Webhooks, etc.)
* What Stripe IDs are stored in the database
* How webhooks update reservation/payment state
* How refunds and cancellations propagate
* Security and replay-attack considerations

⚠️ No Stripe code — architecture only.

---

### 4️⃣ Ticketing & access model (NO accounts)

Describe:

* How ticket access links work
* How secure access tokens are generated and stored
* How QR codes or check-in identifiers could work
* How reservation details can be viewed without authentication

---

### 5️⃣ Public-facing backend needs

Describe endpoints / server actions for:

* Listing slots for an event
* Showing remaining capacity
* Creating a reservation
* Starting Stripe checkout
* Handling post-payment confirmation
* Viewing a reservation via access token

---

### 6️⃣ Admin-facing flows (authenticated)

Describe how admins can:

* Create / edit / delete event slots
* Set capacity and pricing per slot
* View reservations per slot
* Manually cancel reservations
* Trigger refunds
* See payment status

---

### 7️⃣ Naming & consistency

You MUST:

* Choose ONE term: `event_slot`, `service`, or `session`
* Justify your choice
* Use it consistently across DB, API, and UI concepts

---

## 📐 Output format requirements

* Use **clear section headings**
* Use bullet points
* Include simple diagrams if helpful (ASCII allowed)
* Be explicit and implementation-oriented
* Assume a developer will implement this directly after reading

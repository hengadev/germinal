# 017 — Manual/comp Reservation creation

**Type:** AFK
**Status:** open
**Blocked by:** None

## What to build

Give Admins a way to create a Reservation directly for a specific Session (e.g., to comp a seat for a Guest) without the Guest going through the public checkout flow. This must go through the same capacity-locking logic as a normal Guest booking so capacity accounting stays correct, but skips real payment collection — either by not creating a Payment record at all for a comp, or by recording a zero-amount/comp Payment, whichever keeps the Reservation's downstream logic (Ticket generation, capacity counts, reporting) consistent with paid Reservations.

## Acceptance criteria

- [ ] An Admin can create a confirmed Reservation for a Guest against a specific Session directly from the admin UI, without a payment step.
- [ ] The Session's available capacity is decremented exactly as it would be for a paid booking, and cannot be oversold by combining comp and paid Reservations.
- [ ] The comped Guest receives a Ticket the same way a paying Guest would.
- [ ] Comp Reservations are distinguishable from paid ones in the admin views (e.g. in the Reservation list/detail and in analytics/exports).

## Parent

docs/prd/admin-back-office-improvements.md

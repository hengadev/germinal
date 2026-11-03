/**
 * The Arrivées Day guest list (issue 016): the current Day's confirmed
 * Reservations, grouped by Seating, with each party shaped by the caller's
 * Staff permissions — fields not allowed are never selected from the
 * database. Internal Notes are never part of any query here.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, events, payments, reservations, users } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import { normaliseEmail } from '$lib/utils/guest-email';
import { tagsByEmail } from './guest-notes';
import { ANONYMISED_EMAIL } from '../jobs/purge-personal-data';
import { refundPolicyOf } from '$lib/utils/refund-policy';

/** One party (a confirmed Reservation), with only the allowed fields. */
export interface DayGuestParty {
	/** Reservation id — only with the guest list permission. */
	id?: string;
	guestName?: string;
	quantity?: number;
	/** Balance due at the venue, in cents — only with the guest list. */
	balanceAmount?: number;
	/** Issue 066: what gift cards already paid of it at the door, in cents. */
	giftCardPaidAtDoor?: number;
	currency?: string;
	isComp?: boolean;
	/** Issue 020: a Walk-in recorded on the spot. */
	origin?: 'online' | 'staff' | 'walk_in';
	/** Sum of this party's non-undone Check-ins — only with the guest list. */
	arrived?: number;
	/** When this party's last non-undone Check-in was recorded — guest list only. */
	lastCheckInAt?: Date | null;
	/** When the Balance was settled on site — only with the guest list. */
	balanceSettledAt?: Date | null;
	/** Who settled the Balance, "Prénom Nom" — only with the guest list. */
	balanceSettledByName?: string | null;
	/** When Staff last Moved this party to another Seating — guest list only. */
	lastMovedAt?: Date | null;
	/** Who moved it, "Prénom Nom" — guest list only. */
	lastMovedByName?: string | null;
	/** Only with the Dietary Requirements permission. */
	dietaryRequirements?: string | null;
	/** Only with the contact details permission. */
	guestPhone?: string | null;
	guestEmail?: string;
	/** Deposit paid online, in cents — only with cancel_refund (issue 041). */
	paidOnline?: number;
	/** What remains refundable, in cents — only with cancel_refund. */
	refundable?: number;
	/** The Refund Policy's suggestion for a guest cancellation, in cents,
	 * null when the policy suggests nothing (a manual policy). */
	suggestedRefund?: number | null;
	/** total_amount, in cents — only with change_party (issue 048). */
	totalAmount?: number;
	/** The Deposit actually paid online, minus refunds, in cents — only
	 * with change_party (issue 048). */
	depositPaid?: number;
	/** Issue 051: the Guest's Admin tags — never the note itself. */
	tags?: string[];
	/** Issue 051: which visit of the Event this Reservation is (1 = first). */
	visitNumber?: number;
}

/** One Seating of the Day with its parties. */
export interface DayGuestSeating {
	id: string;
	/** The Service the Seating belongs to (Déjeuner or Dîner of the Day). */
	serviceId: string;
	serviceKind: 'lunch' | 'dinner';
	titleFr: string | null;
	titleEn: string | null;
	startTime: string;
	/** Sum of the confirmed parties' sizes. */
	booked: number;
	/** The Seating's capacity, or null when it has none. */
	totalCapacity: number | null;
	/** Seats still free, or null when the Seating has no limit (issue 048). */
	availableCapacity: number | null;
	/** « Fermé aux réservations » (039): the heading shows a mark. */
	bookingsClosed: boolean;
	parties: DayGuestParty[];
}

export interface DayGuestList {
	/** The Day being shown, 'YYYY-MM-DD'. */
	day: string;
	seatings: DayGuestSeating[];
	/** The Event's Refund Policy, for the party-size sheet's refund
	 * suggestion — only with change_party (issue 048). */
	refundPolicy?: import('$lib/utils/refund-policy').RefundPolicy;
}

/** Which party fields this access allows (and therefore selects). */
export function dayGuestFields(access: StaffAccess): {
	guestList: boolean;
	dietary: boolean;
	contact: boolean;
} {
	return {
		guestList: access.can('guest_list'),
		dietary: access.can('dietary'),
		contact: access.can('contact'),
	};
}

type PartyColumns = Record<string, unknown>;

/**
 * The select columns for a party row: the Seating id (grouping is always
 * allowed) and only the party fields the access allows.
 */
function partyColumns(access: StaffAccess): PartyColumns {
	const fields = dayGuestFields(access);
	const columns: PartyColumns = { seatingId: eventSessions.id };
	if (fields.guestList) {
		columns.id = reservations.id;
		columns.guestName = reservations.guestName;
		columns.quantity = reservations.quantity;
		columns.balanceAmount = reservations.balanceAmount;
		columns.giftCardPaidAtDoor = sql`(
			select coalesce(-sum(l.amount), 0)::int
			from gift_card_ledger l
			where l.reservation_id = ${reservations.id} and l.reason = 'door'
		)`;
		columns.currency = reservations.currency;
		columns.isComp = reservations.isComp;
		columns.origin = reservations.origin;
		// Guests already in: non-undone Check-ins only, so an undone one stops counting.
		columns.arrived = sql`(
			select coalesce(sum(ci.guests), 0)::int
			from check_ins ci
			where ci.reservation_id = ${reservations.id} and ci.undone_at is null
		)`;
		columns.lastCheckInAt = sql`(
			select max(ci.checked_in_at) from check_ins ci
			where ci.reservation_id = ${reservations.id} and ci.undone_at is null
		)`;
		columns.balanceSettledAt = reservations.balanceSettledAt;
		columns.balanceSettledByName = sql<string | null>`(
			select u.first_name || ' ' || u.last_name
			from users u where u.id = ${reservations.balanceSettledBy}
		)`;
		columns.lastMovedAt = reservations.lastMovedAt;
		columns.lastMovedByName = sql<string | null>`(
			select u.first_name || ' ' || u.last_name
			from users u where u.id = ${reservations.lastMovedBy}
		)`;
	}
	if (fields.dietary) {
		columns.guestName = reservations.guestName;
		columns.quantity = reservations.quantity;
		columns.dietaryRequirements = reservations.dietaryRequirements;
	}
	if (fields.contact) {
		columns.guestPhone = reservations.guestPhone;
		columns.guestEmail = reservations.guestEmail;
	}
	return columns;
}

function hasAnyGuestField(access: StaffAccess): boolean {
	const f = dayGuestFields(access);
	return f.guestList || f.dietary || f.contact;
}

/** The Day's Seatings, in start-time order, with their capacity. */
async function daySeatings(eventId: string, day: string): Promise<DayGuestSeating[]> {
	const rows = await db
		.select({
			id: eventSessions.id,
			serviceId: eventServices.id,
			serviceKind: eventServices.kind,
			titleFr: eventSessions.titleFr,
			titleEn: eventSessions.titleEn,
			startTime: eventSessions.startTime,
			totalCapacity: eventSessions.totalCapacity,
			availableCapacity: eventSessions.availableCapacity,
			bookingsClosedAt: eventSessions.bookingsClosedAt,
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(and(eq(eventSessions.eventId, eventId), eq(eventDays.date, day)))
		.orderBy(asc(eventSessions.startTime));
	return rows.map((r: {
		id: string;
		serviceId: string;
		serviceKind: 'lunch' | 'dinner';
		titleFr: string | null;
		titleEn: string | null;
		startTime: Date;
		totalCapacity: number | null;
		availableCapacity: number | null;
		bookingsClosedAt: Date | null;
	}) => ({
		id: r.id,
		serviceId: r.serviceId,
		serviceKind: r.serviceKind,
		titleFr: r.titleFr,
		titleEn: r.titleEn,
		startTime: r.startTime.toISOString(),
		totalCapacity: r.totalCapacity,
		availableCapacity: r.availableCapacity,
		bookingsClosed: r.bookingsClosedAt !== null,
		booked: 0,
		parties: [],
	}));
}

type PartyRow = DayGuestParty & { seatingId: string };

/** Strip the grouping key from a row. */
function toParty(row: PartyRow): DayGuestParty {
	const { seatingId: _seatingId, ...party } = row;
	return party;
}

/**
 * The current Day's parties for this Event, grouped by Seating. Returns
 * null outside a Day window or with none of the guest permissions.
 */
export async function getDayGuestList(
	access: StaffAccess,
	eventId: string
): Promise<DayGuestList | null> {
	const day = access.day;
	if (day === null || !hasAnyGuestField(access)) return null;

	const seatings = await daySeatings(eventId, day);
	if (seatings.length === 0) return { day, seatings };

	const rows = (await db
		.select(partyColumns(access))
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.where(
			and(
				inArray(
					reservations.eventSessionId,
					seatings.map((s) => s.id)
				),
				eq(reservations.status, 'confirmed')
			)
		)
		.orderBy(asc(reservations.guestName))) as unknown as PartyRow[];

	const bySeating = new Map(seatings.map((s) => [s.id, s]));
	for (const row of rows) {
		const seating = bySeating.get(row.seatingId);
		if (!seating) continue;
		const party = toParty(row);
		seating.parties.push(party);
		seating.booked += party.quantity ?? 0;
	}
	await withGuestIdentity(seatings.flatMap((s) => s.parties));
	return { day, seatings };
}

/**
 * Issue 051 — decorate every party with the Guest's Admin tags and its
 * visit number: this Reservation plus the Guest's earlier confirmed ones
 * (any Event) whose Seating had already started, matched by normalised
 * email. The email is read here by Reservation id, never sent to the
 * portal: tags show to whoever sees the guest list, contact details or
 * not. Batched queries; the Admin note is never selected.
 */
async function withGuestIdentity(parties: DayGuestParty[]): Promise<void> {
	const ids = parties.flatMap((party) => (party.id ? [party.id] : []));
	if (ids.length === 0) return;
	const emailExpr = sql<string | null>`lower(btrim(${reservations.guestEmail}))`;

	const own = await db
		.select({ id: reservations.id, email: emailExpr, startTime: eventSessions.startTime })
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.where(inArray(reservations.id, ids));
	const byId = new Map<string, { email: string; startTime: Date }>();
	for (const row of own) {
		const email = normaliseEmail(row.email);
		if (email !== null && email !== ANONYMISED_EMAIL) byId.set(row.id, { email, startTime: new Date(row.startTime) });
	}
	const emails = [...new Set([...byId.values()].map((r) => r.email))];
	if (emails.length === 0) return;

	const tags = await tagsByEmail(emails);
	const visits = await db
		.select({ email: emailExpr, startTime: eventSessions.startTime })
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.where(and(inArray(emailExpr, emails), eq(reservations.status, 'confirmed')));
	const startsByEmail = new Map<string, number[]>();
	for (const visit of visits) {
		if (visit.email === null) continue;
		const list = startsByEmail.get(visit.email) ?? [];
		list.push(new Date(visit.startTime).getTime());
		startsByEmail.set(visit.email, list);
	}
	for (const party of parties) {
		const own = party.id ? byId.get(party.id) : undefined;
		if (!own) continue;
		party.tags = tags.get(own.email) ?? [];
		const start = own.startTime.getTime();
		party.visitNumber = (startsByEmail.get(own.email) ?? []).filter((t) => t < start).length + 1;
	}
}

/** Why a Ticket that lookupTicket returned null did not match. */
export type TicketExplanation =
	| { reason: 'unknown' }
	| { reason: 'other_event' }
	| { reason: 'cancelled' }
	| { reason: 'not_confirmed' }
	| { reason: 'other_day'; day: string };

/**
 * Explain a Ticket lookupTicket could not resolve, for the door's refusal
 * message. Only called when lookupTicket returned null. Selects just the
 * Reservation's status, its Event id and its Day's date — never a guest
 * field, so nothing of another Event's party can leak.
 */
export async function explainTicket(
	eventId: string,
	token: string
): Promise<TicketExplanation> {
	if (!token) return { reason: 'unknown' };
	const [row] = await db
		.select({
			status: reservations.status,
			rowEventId: eventSessions.eventId,
			day: eventDays.date,
		})
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(eq(reservations.accessToken, token))
		.limit(1);
	if (!row) return { reason: 'unknown' };
	// Another Event's Ticket says only that, nothing about its Reservation.
	if (row.rowEventId !== eventId) return { reason: 'other_event' };
	// Unpaid (pending, processing) or expired is not the same as cancelled:
	// the Guest may only have a booking to finish, so say so at the door.
	if (row.status === 'cancelled') return { reason: 'cancelled' };
	if (row.status !== 'confirmed') return { reason: 'not_confirmed' };
	// lookupTicket already excluded the current Day (or there is none), so a
	// confirmed Ticket of this Event is for another Day.
	return { reason: 'other_day', day: row.day };
}

/**
 * Resolve a Ticket token (`reservations.accessToken`) to one party of the
 * current Day at this Event, with the same permission shaping. Returns
 * null for any other Event's or another Day's Ticket, or outside a Day.
 */
export async function lookupTicket(
	access: StaffAccess,
	eventId: string,
	token: string
): Promise<DayGuestParty | null> {
	const day = access.day;
	if (day === null || !hasAnyGuestField(access) || !token) return null;

	const [row] = (await db
		.select(partyColumns(access))
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(
			and(
				eq(reservations.accessToken, token),
				eq(eventSessions.eventId, eventId),
				eq(eventDays.date, day),
				eq(reservations.status, 'confirmed')
			)
		)
		.limit(1)) as unknown as PartyRow[];
	if (!row) return null;
	const party = toParty(row);
	await withGuestIdentity([party]);
	return party;
}

/**
 * Add what the party-size sheet's live quote needs (issue 048): each
 * party's total and Deposit actually paid online, and the Event's Refund
 * Policy — only for a viewer who holds change_party.
 */
export async function withPartySizeInfo(
	access: StaffAccess,
	eventId: string,
	list: DayGuestList
): Promise<DayGuestList> {
	if (!access.can('change_party')) return list;

	const ids = list.seatings
		.flatMap((s) => s.parties)
		.map((p) => p.id)
		.filter((id): id is string => Boolean(id));
	const totals = new Map<string, number>();
	if (ids.length > 0) {
		const rows = await db
			.select({ id: reservations.id, totalAmount: reservations.totalAmount })
			.from(reservations)
			.where(inArray(reservations.id, ids));
		for (const row of rows) totals.set(row.id, row.totalAmount);
	}
	const depositPaid = new Map<string, number>();
	if (ids.length > 0) {
		const rows = await db
			.select({
				reservationId: payments.reservationId,
				amount: payments.amount,
				refundedAmount: payments.refundedAmount,
			})
			.from(payments)
			.where(inArray(payments.reservationId, ids));
		for (const row of rows) {
			depositPaid.set(row.reservationId, row.amount - (row.refundedAmount ?? 0));
		}
	}
	const [event] = await db
		.select({
			refundPolicyType: events.refundPolicyType,
			refundPolicyTextEn: events.refundPolicyTextEn,
			refundPolicyTextFr: events.refundPolicyTextFr,
			refundPolicyTiers: events.refundPolicyTiers,
		})
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);
	list.refundPolicy = refundPolicyOf(event ?? {});

	for (const seating of list.seatings) {
		for (const party of seating.parties) {
			if (!party.id) continue;
			party.totalAmount = totals.get(party.id) ?? 0;
			party.depositPaid = depositPaid.get(party.id) ?? 0;
		}
	}
	return list;
}

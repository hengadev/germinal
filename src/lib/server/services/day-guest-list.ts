/**
 * The Arrivées Day guest list (issue 016): the current Day's confirmed
 * Reservations, grouped by Seating, with each party shaped by the caller's
 * Staff permissions — fields not allowed are never selected from the
 * database. Internal Notes are never part of any query here.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, reservations } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';

/** One party (a confirmed Reservation), with only the allowed fields. */
export interface DayGuestParty {
	/** Reservation id — only with the guest list permission. */
	id?: string;
	guestName?: string;
	quantity?: number;
	/** Balance due at the venue, in cents — only with the guest list. */
	balanceAmount?: number;
	currency?: string;
	isComp?: boolean;
	/** Sum of this party's non-undone Check-ins — only with the guest list. */
	arrived?: number;
	/** When this party's last non-undone Check-in was recorded — guest list only. */
	lastCheckInAt?: Date | null;
	/** Only with the Dietary Requirements permission. */
	dietaryRequirements?: string | null;
	/** Only with the contact details permission. */
	guestPhone?: string | null;
	guestEmail?: string;
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
	parties: DayGuestParty[];
}

export interface DayGuestList {
	/** The Day being shown, 'YYYY-MM-DD'. */
	day: string;
	seatings: DayGuestSeating[];
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
		columns.currency = reservations.currency;
		columns.isComp = reservations.isComp;
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
	}) => ({
		id: r.id,
		serviceId: r.serviceId,
		serviceKind: r.serviceKind,
		titleFr: r.titleFr,
		titleEn: r.titleEn,
		startTime: r.startTime.toISOString(),
		totalCapacity: r.totalCapacity,
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
	return { day, seatings };
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
	return row ? toParty(row) : null;
}

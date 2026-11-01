/**
 * Guest summaries (issue 049): the Admin's « Clients » page. A Guest is
 * their email, lower-cased and trimmed; nothing is stored — every figure
 * is computed from Reservations, Check-ins and payments on demand.
 *
 * Reservations without an email (Walk-ins, on-the-spot Comps) and
 * anonymised ones (ANONYMISED_EMAIL, see jobs/purge-personal-data) are
 * excluded. Visits, arrivals and No-shows only count Seatings that are
 * over; upcoming Reservations are counted apart. Amounts are net of
 * refunds and kept per currency, never summed across currencies.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventSessions, events, payments, reservations } from '../db/schema';
import { ANONYMISED_EMAIL } from '../jobs/purge-personal-data';
import { emailFromGuestKey, guestKeyFromEmail } from '$lib/utils/guest-email';

/** The Guest's identity: the normalised email. */
const emailExpr = sql<string>`lower(btrim(${reservations.guestEmail}))`;

/** Guests in, from non-undone Check-ins (as in the attendance service). */
const arrivedExpr = sql<number>`coalesce((
	select sum(ci.guests) from check_ins ci
	where ci.reservation_id = ${reservations.id} and ci.undone_at is null
), 0)::int`;

/** Net paid (payments taken minus refunds), in cents. */
const paidNetExpr = sql<number>`coalesce((
	select sum(p.amount - p.refunded_amount) from payments p
	where p.reservation_id = ${reservations.id}
		and p.status in ('succeeded', 'partially_refunded', 'refunded')
), 0)::int`;

/** The Seating is over: the door is closed and the counts won't move. */
const overExpr = sql<boolean>`${eventSessions.endTime} <= now()`;

/** A booked Reservation: confirmed, not a Comp, not a Walk-in. */
const bookedExpr = sql`${reservations.status} = 'confirmed' and not ${reservations.isComp} and ${reservations.origin} <> 'walk_in'`;

const isGuestEmailExpr = sql`${emailExpr} <> '' and ${emailExpr} <> ${ANONYMISED_EMAIL}`;

export type GuestSort = 'last-visit' | 'visits' | 'amount';

export interface GuestAmount {
	currency: string;
	net: number;
}

export interface GuestRow {
	email: string;
	name: string;
	/** Confirmed Reservations whose Seating is over. */
	visits: number;
	guestsArrived: number;
	noShows: number;
	/** Net paid per currency. */
	amounts: GuestAmount[];
	lastVisit: string | null;
	/** Confirmed Reservations whose Seating is not over. */
	upcoming: number;
}

export interface GuestListResult {
	guests: GuestRow[];
	total: number;
	page: number;
	pageCount: number;
}

export interface GuestReservation {
	id: string;
	eventTitleFr: string | null;
	eventTitleEn: string | null;
	seatingStart: string;
	quantity: number;
	status: string;
	guestsArrived: number;
	net: number;
	currency: string;
}

export interface GuestDetail extends GuestRow {
	reservations: GuestReservation[];
}

const DEFAULT_PAGE_SIZE = 25;

interface GuestAggregates {
	email: string;
	name: string;
	visits: number;
	guestsArrived: number;
	noShows: number;
	lastVisit: Date | null;
	upcoming: number;
}

const aggregateSelect = {
	email: emailExpr,
	name: sql<string>`(array_agg(${reservations.guestName} order by ${eventSessions.endTime} desc, ${reservations.createdAt} desc))[1]`,
	visits: sql<number>`count(*) filter (where ${reservations.status} = 'confirmed' and ${overExpr})::int`,
	guestsArrived: sql<number>`coalesce(sum(${arrivedExpr}) filter (where ${reservations.status} = 'confirmed' and ${overExpr}), 0)::int`,
	noShows: sql<number>`coalesce(sum(case when ${bookedExpr} and ${overExpr} then greatest(${reservations.quantity} - ${arrivedExpr}, 0) else 0 end), 0)::int`,
	lastVisit: sql<Date | null>`max(${eventSessions.endTime}) filter (where ${reservations.status} = 'confirmed' and ${overExpr})`,
	upcoming: sql<number>`count(*) filter (where ${reservations.status} = 'confirmed' and not ${overExpr})::int`
};

/** Net amounts per email and currency, across all Guests. */
async function amountsByEmail(): Promise<Map<string, GuestAmount[]>> {
	const rows = await db
		.select({
			email: emailExpr,
			currency: payments.currency,
			net: sql<number>`sum(${payments.amount} - ${payments.refundedAmount})::int`
		})
		.from(payments)
		.innerJoin(reservations, eq(payments.reservationId, reservations.id))
		.where(
			and(
				sql`${payments.status} in ('succeeded', 'partially_refunded', 'refunded')`,
				isGuestEmailExpr
			)
		)
		.groupBy(emailExpr, payments.currency);

	const map = new Map<string, GuestAmount[]>();
	for (const row of rows) {
		const list = map.get(row.email) ?? [];
		list.push({ currency: row.currency, net: row.net });
		map.set(row.email, list);
	}
	for (const list of map.values()) list.sort((a, b) => a.currency.localeCompare(b.currency));
	return map;
}

/** Sort key for ordering by amount: the sum across currencies, ordering only. */
function amountTotal(amounts: GuestAmount[]): number {
	return amounts.reduce((sum, a) => sum + a.net, 0);
}

/**
 * List the Guests: search by name or email, sorted by last visit (the
 * default), visits or net amount, paginated.
 */
export async function listGuests(params: {
	search?: string;
	sort?: GuestSort;
	page?: number;
	pageSize?: number;
}): Promise<GuestListResult> {
	const search = params.search?.trim() ?? '';
	const sort: GuestSort = params.sort ?? 'last-visit';
	const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

	const rows = (await db
		.select(aggregateSelect)
		.from(reservations)
		.innerJoin(eventSessions, eq(eventSessions.id, reservations.eventSessionId))
		.where(isGuestEmailExpr)
		.groupBy(emailExpr)
		// The search matches any of the Guest's Reservations, so it lives in
		// HAVING: the aggregates always cover every Reservation.
		.having(
			search
				? sql`(${emailExpr}) like ${'%' + search.toLowerCase() + '%'} or bool_or(${reservations.guestName} ilike ${'%' + search + '%'})`
				: sql`true`
		)
	) as GuestAggregates[];

	const amounts = await amountsByEmail();

	const guests: GuestRow[] = rows.map((row) => ({
		email: row.email,
		name: row.name,
		visits: row.visits,
		guestsArrived: row.guestsArrived,
		noShows: row.noShows,
		amounts: amounts.get(row.email) ?? [],
		lastVisit: row.lastVisit ? new Date(row.lastVisit).toISOString() : null,
		upcoming: row.upcoming
	}));

	guests.sort((a, b) => {
		if (sort === 'visits') {
			if (b.visits !== a.visits) return b.visits - a.visits;
		} else if (sort === 'amount') {
			const diff = amountTotal(b.amounts) - amountTotal(a.amounts);
			if (diff !== 0) return diff;
		}
		// Default and tie-break: last visit, most recent first, then email.
		const aLast = a.lastVisit ?? '';
		const bLast = b.lastVisit ?? '';
		if (aLast !== bLast) return aLast < bLast ? 1 : -1;
		return a.email.localeCompare(b.email);
	});

	const total = guests.length;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const page = Math.min(Math.max(1, params.page ?? 1), pageCount);

	return { guests: guests.slice((page - 1) * pageSize, page * pageSize), total, page, pageCount };
}

interface GuestReservationHistoryRow {
	id: string;
	eventTitleFr: string | null;
	eventTitleEn: string | null;
	seatingStart: Date;
	quantity: number;
	status: string;
	guestsArrived: number;
	net: number;
	currency: string;
}

/**
 * Null when the key is invalid or no Guest matches.
 */
export async function getGuest(key: string): Promise<GuestDetail | null> {
	const email = emailFromGuestKey(key);
	if (email === null) return null;

	const [aggregate] = (await db
		.select(aggregateSelect)
		.from(reservations)
		.innerJoin(eventSessions, eq(eventSessions.id, reservations.eventSessionId))
		.where(and(isGuestEmailExpr, sql`${emailExpr} = ${email}`))
		.groupBy(emailExpr)) as GuestAggregates[];
	if (!aggregate) return null;

	const history = await db
		.select({
			id: reservations.id,
			eventTitleFr: events.titleFr,
			eventTitleEn: events.titleEn,
			seatingStart: eventSessions.startTime,
			quantity: reservations.quantity,
			status: reservations.status,
			guestsArrived: arrivedExpr,
			net: paidNetExpr,
			currency: reservations.currency
		})
		.from(reservations)
		.innerJoin(eventSessions, eq(eventSessions.id, reservations.eventSessionId))
		.innerJoin(events, eq(events.id, eventSessions.eventId))
		.where(and(isGuestEmailExpr, sql`${emailExpr} = ${email}`))
		.orderBy(sql`${eventSessions.startTime} desc`);

	const amounts = await amountsByEmail();

	return {
		email: aggregate.email,
		name: aggregate.name,
		visits: aggregate.visits,
		guestsArrived: aggregate.guestsArrived,
		noShows: aggregate.noShows,
		amounts: amounts.get(aggregate.email) ?? [],
		lastVisit: aggregate.lastVisit ? new Date(aggregate.lastVisit).toISOString() : null,
		upcoming: aggregate.upcoming,
		reservations: history.map((row: GuestReservationHistoryRow) => ({
			...row,
			seatingStart: new Date(row.seatingStart).toISOString()
		}))
	};
}

/** The URL-safe key for an email, exposed for pages linking to a Guest. */
export function guestKey(email: string): string | null {
	return guestKeyFromEmail(email);
}

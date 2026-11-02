/**
 * Attendance (issue 024): each Seating's final counts once the Event is
 * over — booked, arrived, No-shows, Walk-ins and Comps — grouped by Day
 * and Service, with Event totals. It's for the Admin's Recap and for
 * deciding how far to overbook the next Event.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, payments, reservations } from '../db/schema';

/** Party and guest counts for Walk-ins and Comps. */
export interface AttendanceCategory {
	parties: number;
	guests: number;
}

/** One Seating's attendance. */
export interface SeatingAttendance {
	id: string;
	startTime: Date;
	/** Guests of confirmed booked Reservations (online and Admin/staff-made, non-comp). */
	booked: number;
	/** Guests in, all categories, from non-undone Check-ins. */
	arrived: number;
	/** Booked guests who never checked in. */
	noShows: number;
	walkIns: AttendanceCategory;
	comps: AttendanceCategory;
}

export interface ServiceAttendance {
	kind: 'lunch' | 'dinner';
	seatings: SeatingAttendance[];
}

export interface DayAttendance {
	date: string;
	services: ServiceAttendance[];
}

export interface EventAttendance {
	days: DayAttendance[];
	totals: {
		booked: number;
		arrived: number;
		noShows: number;
		walkIns: AttendanceCategory;
		comps: AttendanceCategory;
	};
}

/**
 * Over once the Event's last Seating has ended: the door is closed and
 * the counts won't move. An Event with no Seatings is never over.
 */
export function isEventOver(lastSeatingEnd: Date | null, now: Date): boolean {
	return lastSeatingEnd !== null && now.getTime() >= lastSeatingEnd.getTime();
}

/** Guests of a Reservation already in — undone Check-ins never count. */
const arrivedExpr = sql<number>`coalesce((
	select sum(ci.guests) from check_ins ci
	where ci.reservation_id = ${reservations.id} and ci.undone_at is null
), 0)::int`;

/** A booked Reservation: confirmed, not a Comp, not a Walk-in. */
const bookedExpr = sql`${reservations.id} is not null and not ${reservations.isComp} and ${reservations.origin} <> 'walk_in'`;

/**
 * The Event's money, grouped by currency (issue 057): deposits kept
 * (succeeded Payment amounts minus refunded amounts), refunds, and
 * Balances of confirmed Reservations marked settled. Cancelled
 * Reservations never contribute, even a settled Balance.
 */
export interface CurrencyMoney {
	currency: string;
	depositsKept: number;
	refunds: number;
	balancesCollected: number;
}

export async function getEventMoney(eventId: string): Promise<CurrencyMoney[]> {
	const [paymentRows, balanceRows] = await Promise.all([
		db
			.select({
				currency: payments.currency,
				kept: sql<number>`coalesce(sum(${payments.amount} - ${payments.refundedAmount}), 0)::int`,
				refunded: sql<number>`coalesce(sum(${payments.refundedAmount}), 0)::int`
			})
			.from(payments)
			.innerJoin(reservations, eq(reservations.id, payments.reservationId))
			.innerJoin(eventSessions, eq(eventSessions.id, reservations.eventSessionId))
			.where(
				and(
					eq(eventSessions.eventId, eventId),
				sql`${payments.status} in ('succeeded', 'partially_refunded', 'refunded')`
				)
			)
			.groupBy(payments.currency),
		db
			.select({
				currency: reservations.currency,
				collected: sql<number>`coalesce(sum(${reservations.balanceAmount}), 0)::int`
			})
			.from(reservations)
			.innerJoin(eventSessions, eq(eventSessions.id, reservations.eventSessionId))
			.where(
				and(
					eq(eventSessions.eventId, eventId),
				eq(reservations.status, 'confirmed'),
				sql`${reservations.balanceSettledAt} is not null`
			)
			)
			.groupBy(reservations.currency)
	]);

	const byCurrency = new Map<string, CurrencyMoney>();
	const row = (currency: string) => {
		let entry = byCurrency.get(currency);
		if (!entry) {
			entry = { currency, depositsKept: 0, refunds: 0, balancesCollected: 0 };
			byCurrency.set(currency, entry);
		}
		return entry;
	};
	for (const p of paymentRows) {
		const entry = row(p.currency);
		entry.depositsKept += p.kept;
		entry.refunds += p.refunded;
	}
	for (const b of balanceRows) row(b.currency).balancesCollected += b.collected;
	return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * The Event's attendance, one row per Seating in one grouped query,
 * ordered by Day, Service and start time.
 */
export async function getEventAttendance(eventId: string): Promise<EventAttendance> {
	const rows = await db
		.select({
			seatingId: eventSessions.id,
			startTime: eventSessions.startTime,
			dayDate: eventDays.date,
			serviceKind: eventServices.kind,
			booked: sql<number>`coalesce(sum(case when ${bookedExpr} then ${reservations.quantity} else 0 end), 0)::int`,
			arrived: sql<number>`coalesce(sum(${arrivedExpr}), 0)::int`,
			noShows: sql<number>`coalesce(sum(case when ${bookedExpr} then greatest(${reservations.quantity} - ${arrivedExpr}, 0) else 0 end), 0)::int`,
			walkInParties: sql<number>`count(*) filter (where ${reservations.origin} = 'walk_in')::int`,
			walkInGuests: sql<number>`coalesce(sum(${reservations.quantity}) filter (where ${reservations.origin} = 'walk_in'), 0)::int`,
			compParties: sql<number>`count(*) filter (where ${reservations.isComp} and ${reservations.origin} <> 'walk_in')::int`,
			compGuests: sql<number>`coalesce(sum(${reservations.quantity}) filter (where ${reservations.isComp} and ${reservations.origin} <> 'walk_in'), 0)::int`
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventServices.id, eventSessions.serviceId))
		.innerJoin(eventDays, eq(eventDays.id, eventServices.dayId))
		.leftJoin(
			reservations,
			and(
				eq(reservations.eventSessionId, eventSessions.id),
				eq(reservations.status, 'confirmed')
			)
		)
		.where(eq(eventSessions.eventId, eventId))
		.groupBy(eventSessions.id, eventSessions.startTime, eventDays.date, eventServices.kind)
		.orderBy(
			eventDays.date,
			sql`case ${eventServices.kind} when 'lunch' then 0 else 1 end`,
			eventSessions.startTime
		);

	const totals = {
		booked: 0,
		arrived: 0,
		noShows: 0,
		walkIns: { parties: 0, guests: 0 },
		comps: { parties: 0, guests: 0 }
	};
	const days: DayAttendance[] = [];
	for (const row of rows) {
		let day = days.find((d) => d.date === row.dayDate);
		if (!day) {
			day = { date: row.dayDate, services: [] };
			days.push(day);
		}
		let service = day.services.find((s) => s.kind === row.serviceKind);
		if (!service) {
			service = { kind: row.serviceKind, seatings: [] };
			day.services.push(service);
		}
		service.seatings.push({
			id: row.seatingId,
			startTime: row.startTime,
			booked: row.booked,
			arrived: row.arrived,
			noShows: row.noShows,
			walkIns: { parties: row.walkInParties, guests: row.walkInGuests },
			comps: { parties: row.compParties, guests: row.compGuests }
		});
		totals.booked += row.booked;
		totals.arrived += row.arrived;
		totals.noShows += row.noShows;
		totals.walkIns.parties += row.walkInParties;
		totals.walkIns.guests += row.walkInGuests;
		totals.comps.parties += row.compParties;
		totals.comps.guests += row.compGuests;
	}
	return { days, totals };
}

/** Totals of the Day's live attendance (issue 056). */
export interface TodayTotals {
	booked: number;
	arrived: number;
	/** Booked guests not in yet, in Seatings that haven't ended. */
	stillToCome: number;
	/** No-shows of the Seatings that have ended only. */
	noShows: number;
	walkIns: AttendanceCategory;
	comps: AttendanceCategory;
}

/** One Seating's live attendance during its Day. */
export interface TodaySeatingAttendance {
	id: string;
	startTime: Date;
	endTime: Date;
	booked: number;
	arrived: number;
	stillToCome: number;
	/** Counted only once the Seating's end time has passed; 0 before. */
	noShows: number;
	ended: boolean;
	walkIns: AttendanceCategory;
	comps: AttendanceCategory;
	totalCapacity: number | null;
	/** Capacity minus booked, Walk-in and Comp guests; null without capacity. */
	seatsLeft: number | null;
}

export interface TodayServiceAttendance {
	kind: 'lunch' | 'dinner';
	seatings: TodaySeatingAttendance[];
	totals: TodayTotals;
}

export interface TodayAttendance {
	date: string;
	services: TodayServiceAttendance[];
	totals: TodayTotals;
}

/**
 * The current Day's live attendance (issue 056): per-Seating rows grouped
 * by Service, with Service and Day totals. Reuses the Event recap's
 * definitions of booked, arrived, Walk-in and Comp, so both always agree.
 * No-shows appear only once a Seating has ended.
 */
export async function getDayAttendance(
	eventId: string,
	day: string,
	now: Date
): Promise<TodayAttendance> {
	const rows = await db
		.select({
			seatingId: eventSessions.id,
			startTime: eventSessions.startTime,
			endTime: eventSessions.endTime,
			serviceKind: eventServices.kind,
			totalCapacity: eventSessions.totalCapacity,
			booked: sql<number>`coalesce(sum(case when ${bookedExpr} then ${reservations.quantity} else 0 end), 0)::int`,
			arrived: sql<number>`coalesce(sum(${arrivedExpr}), 0)::int`,
			// Booked guests not in yet, party by party: Walk-ins and Comps
			// coming in never lower it (same rule as the recap's No-shows).
			missing: sql<number>`coalesce(sum(case when ${bookedExpr} then greatest(${reservations.quantity} - ${arrivedExpr}, 0) else 0 end), 0)::int`,
			walkInParties: sql<number>`count(*) filter (where ${reservations.origin} = 'walk_in')::int`,
			walkInGuests: sql<number>`coalesce(sum(${reservations.quantity}) filter (where ${reservations.origin} = 'walk_in'), 0)::int`,
			compParties: sql<number>`count(*) filter (where ${reservations.isComp} and ${reservations.origin} <> 'walk_in')::int`,
			compGuests: sql<number>`coalesce(sum(${reservations.quantity}) filter (where ${reservations.isComp} and ${reservations.origin} <> 'walk_in'), 0)::int`
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventServices.id, eventSessions.serviceId))
		.innerJoin(eventDays, eq(eventDays.id, eventServices.dayId))
		.leftJoin(
			reservations,
			and(
				eq(reservations.eventSessionId, eventSessions.id),
				eq(reservations.status, 'confirmed')
			)
		)
		.where(and(eq(eventSessions.eventId, eventId), eq(eventDays.date, day)))
		.groupBy(
			eventSessions.id,
			eventSessions.startTime,
			eventSessions.endTime,
			eventServices.kind,
			eventSessions.totalCapacity
		)
		.orderBy(eventSessions.startTime);

	const emptyTotals = (): TodayTotals => ({
		booked: 0,
		arrived: 0,
		stillToCome: 0,
		noShows: 0,
		walkIns: { parties: 0, guests: 0 },
		comps: { parties: 0, guests: 0 }
	});
	const add = (t: TodayTotals, s: TodaySeatingAttendance) => {
		t.booked += s.booked;
		t.arrived += s.arrived;
		t.stillToCome += s.stillToCome;
		t.noShows += s.noShows;
		t.walkIns.parties += s.walkIns.parties;
		t.walkIns.guests += s.walkIns.guests;
		t.comps.parties += s.comps.parties;
		t.comps.guests += s.comps.guests;
	};

	const services: TodayServiceAttendance[] = [];
	const totals = emptyTotals();
	for (const row of rows) {
		const ended = now.getTime() >= row.endTime.getTime();
		// Once the Seating has ended, who hasn't come is a No-show, not still to come.
		const stillToCome = ended ? 0 : row.missing;
		const seating: TodaySeatingAttendance = {
			id: row.seatingId,
			startTime: row.startTime,
			endTime: row.endTime,
			booked: row.booked,
			arrived: row.arrived,
			stillToCome,
			// Before the end nobody is a No-show: the door is still open.
			noShows: ended ? row.missing : 0,
			ended,
			walkIns: { parties: row.walkInParties, guests: row.walkInGuests },
			comps: { parties: row.compParties, guests: row.compGuests },
			totalCapacity: row.totalCapacity,
			seatsLeft:
				row.totalCapacity === null
					? null
					: row.totalCapacity - row.booked - row.walkInGuests - row.compGuests
		};
		let service = services.find((s) => s.kind === row.serviceKind);
		if (!service) {
			service = { kind: row.serviceKind, seatings: [], totals: emptyTotals() };
			services.push(service);
		}
		service.seatings.push(seating);
		add(service.totals, seating);
		add(totals, seating);
	}
	// Lunch before dinner, like the Event recap.
	services.sort((a, b) => (a.kind === 'lunch' ? 0 : 1) - (b.kind === 'lunch' ? 0 : 1));
	return { date: day, services, totals };
}

/**
 * Attendance (issue 024): each Seating's final counts once the Event is
 * over — booked, arrived, No-shows, Walk-ins and Comps — grouped by Day
 * and Service, with Event totals. It's for the Admin's Recap and for
 * deciding how far to overbook the next Event.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, reservations } from '../db/schema';

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

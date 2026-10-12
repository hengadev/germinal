import { db } from '../db';
import { eventDays, eventServices, eventSessions, events } from '../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

/**
 * Event schedule — the Days → Services → Seatings model (ADR 0005).
 *
 * This module owns the rules that derive a Seating's place in the schedule
 * from its start time, the find-or-attach logic that keeps every Seating
 * parented to exactly one Service, and the recomputation of an Event's
 * start/end dates from its first and last Day.
 *
 * The codebase stores timestamps as UTC instants and has no per-Event
 * local time zone, so day boundaries and the lunch/dinner cut-off are
 * evaluated on the UTC clock (stated in issue 018's summary).
 */

/**
 * Hour (UTC) at which a Seating stops counting as lunch: a start time
 * before 16:00 is lunch, 16:00 and later is dinner. Cut-off confirmed
 * in issue 018.
 */
export const LUNCH_DINNER_CUTOFF_HOUR = 16;

export type ServiceKind = 'lunch' | 'dinner';

/** Kind of the Service a Seating belongs to, from its start time (UTC). */
export function classifyServiceKind(startTime: Date): ServiceKind {
	return startTime.getUTCHours() < LUNCH_DINNER_CUTOFF_HOUR ? 'lunch' : 'dinner';
}

/** Calendar date (UTC) of a Seating, as a `YYYY-MM-DD` day key. */
export function utcDayKey(startTime: Date): string {
	return startTime.toISOString().slice(0, 10);
}

/** Duration of a Seating in whole minutes, rounded up, at least one. */
export function seatingDurationMinutes(startTime: Date, endTime: Date): number {
	return Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 60000));
}

/** First instant of a day key, interpreted as UTC (midnight). */
export function dayStartUtc(day: string): Date {
	return new Date(`${day}T00:00:00.000Z`);
}

/** Last representable instant of a day key, interpreted as UTC. */
export function dayEndUtc(day: string): Date {
	return new Date(`${day}T23:59:59.999Z`);
}

/**
 * Recompute an Event's start/end dates from its Days: the Event starts on
 * its first Day and ends on its last Day. Events is updated in place; an
 * Event with no Days keeps its current dates (nothing to derive from yet).
 */
export async function recomputeEventDatesFromDays(tx: typeof db, eventId: string): Promise<void> {
	const [bounds] = await tx
		.select({
			minDate: sql<string | null>`min(${eventDays.date})::text`,
			maxDate: sql<string | null>`max(${eventDays.date})::text`,
		})
		.from(eventDays)
		.where(eq(eventDays.eventId, eventId));

	if (!bounds?.minDate || !bounds.maxDate) {
		return;
	}

	await tx.update(events)
		.set({
			startDate: dayStartUtc(bounds.minDate),
			endDate: dayEndUtc(bounds.maxDate),
			updatedAt: new Date(),
		})
		.where(eq(events.id, eventId));
}

/**
 * Find or create the Day (Event + date) and Service (Day + kind) a Seating
 * with the given times belongs to, and return the Service's id. The
 * Service's default Seating duration is only set when the Service is
 * created — existing Services keep their configured duration.
 */
export async function findOrAttachService(
	tx: typeof db,
	eventId: string,
	startTime: Date,
	endTime: Date
): Promise<string> {
	const [day] = await tx
		.insert(eventDays)
		.values({ eventId, date: utcDayKey(startTime) })
		.onConflictDoUpdate({
			target: [eventDays.eventId, eventDays.date],
			set: { updatedAt: new Date() },
		})
		.returning();

	const [service] = await tx
		.insert(eventServices)
		.values({
			dayId: day.id,
			kind: classifyServiceKind(startTime),
			defaultSeatingDurationMinutes: seatingDurationMinutes(startTime, endTime),
		})
		.onConflictDoUpdate({
			target: [eventServices.dayId, eventServices.kind],
			set: { updatedAt: new Date() },
		})
		.returning();

	return service.id;
}

/**
 * Remove the Services (then Days) of an Event that no longer have any
 * Seatings, so implicitly created schedule nodes never linger and distort
 * the Event's derived dates. Must run after a Seating is deleted or moved.
 */
export async function pruneEmptyScheduleNodes(tx: typeof db, eventId: string): Promise<void> {
	await tx.delete(eventServices)
		.where(and(
			inArray(
				eventServices.dayId,
				tx.select({ id: eventDays.id }).from(eventDays).where(eq(eventDays.eventId, eventId))
			),
			sql`NOT EXISTS (SELECT 1 FROM event_sessions es WHERE es.service_id = ${eventServices.id})`
		));

	await tx.delete(eventDays)
		.where(and(
			eq(eventDays.eventId, eventId),
			sql`NOT EXISTS (SELECT 1 FROM event_services sv WHERE sv.day_id = ${eventDays.id})`
		));
}

// ---------------------------------------------------------------------------
// Public schedule grouping (Days → Services → Seatings)
// ---------------------------------------------------------------------------

/** A schedule row: a Seating tagged with its Day date and Service kind. */
export interface ScheduleRow<T> {
	dayDate: string;
	serviceKind: ServiceKind;
	item: T;
}

export interface ScheduleServiceGroup<T> {
	kind: ServiceKind;
	items: T[];
}

export interface ScheduleDayGroup<T> {
	date: string;
	services: ScheduleServiceGroup<T>[];
}

const KIND_ORDER: Record<ServiceKind, number> = { lunch: 0, dinner: 1 };

/**
 * Group schedule rows into Days → Services, ordered by date then meal
 * (lunch before dinner) then the order the rows were given in (callers
 * sort Seatings by start time).
 */
export function groupScheduleByDayAndService<T>(
	rows: ScheduleRow<T>[]
): ScheduleDayGroup<T>[] {
	const days = new Map<string, Map<ServiceKind, T[]>>();

	for (const row of rows) {
		let services = days.get(row.dayDate);
		if (!services) {
			services = new Map();
			days.set(row.dayDate, services);
		}
		const items = services.get(row.serviceKind);
		if (items) {
			items.push(row.item);
		} else {
			services.set(row.serviceKind, [row.item]);
		}
	}

	return [...days.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, services]) => ({
			date,
			services: [...services.entries()]
				.sort(([a], [b]) => KIND_ORDER[a] - KIND_ORDER[b])
				.map(([kind, items]) => ({ kind, items })),
		}));
}

/**
 * The published Seatings of an Event, each tagged with its Day date and
 * Service kind, ordered for grouping (day, then start time).
 */
export async function getPublishedScheduleByEventId(
	eventId: string
): Promise<ScheduleRow<typeof eventSessions.$inferSelect>[]> {
	const rows: {
		dayDate: string;
		serviceKind: (typeof eventServices.$inferSelect)['kind'];
		session: typeof eventSessions.$inferSelect;
	}[] = await db
		.select({
			dayDate: sql<string>`${eventDays.date}::text`,
			serviceKind: eventServices.kind,
			session: eventSessions,
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(and(
			eq(eventSessions.eventId, eventId),
			eq(eventSessions.published, true)
		))
		.orderBy(eventDays.date, eventSessions.startTime);

	return rows.map((row) => ({
		dayDate: row.dayDate,
		serviceKind: row.serviceKind,
		item: row.session,
	}));
}

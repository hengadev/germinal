import { db } from '../db';
import { eventDays, eventServices, eventSessions, events, reservations } from '../db/schema';
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

const KIND_ORDER: Record<ServiceKind, number> = { lunch: 0, dinner: 1 };

const ORDERED_SERVICE_KINDS: ServiceKind[] = ['lunch', 'dinner'];

/**
 * Default Seating duration (minutes) given to a Service created by the
 * admin Days picker, which has no Seating yet to carry a duration over.
 */
export const DEFAULT_SERVICE_DURATION_MINUTES: Record<ServiceKind, number> = {
	lunch: 90,
	dinner: 180,
};

/**
 * Reservations that still count against a Day/Service being removed: a
 * guest is booked (or booking) and must never be orphaned.
 */
const LIVE_RESERVATION_STATUSES = ['pending', 'processing', 'confirmed'] as const;

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
// Saving the admin Days picker (issue 019)
// ---------------------------------------------------------------------------

/** A Day picked on the admin calendar, with the meals served that Day. */
export interface PickedServiceDay {
	date: string;
	kinds: ServiceKind[];
}

export type PickedDaysParseFailure =
	| 'missing'
	| 'malformed'
	| 'invalid-date'
	| 'duplicate-day'
	| 'empty'
	| 'day-without-service';

export type PickedDaysParseResult =
	| { ok: true; days: PickedServiceDay[] }
	| { ok: false; reason: PickedDaysParseFailure };

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A day key is valid when it is `YYYY-MM-DD` and a real calendar date. */
function isValidDayKey(date: string): boolean {
	if (!DAY_KEY_PATTERN.test(date)) return false;
	const [year, month, day] = date.split('-').map(Number);
	const utc = new Date(Date.UTC(year, month - 1, day));
	return (
		utc.getUTCFullYear() === year &&
		utc.getUTCMonth() === month - 1 &&
		utc.getUTCDate() === day
	);
}

/**
 * Parse the `days` payload posted by the admin Days picker: a JSON array
 * of `{ date, kinds }` sorted by date with de-duplicated kinds. Returns a
 * failure reason the admin form maps to French copy.
 */
export function parsePickedDays(raw: string | null): PickedDaysParseResult {
	if (raw === null || raw.trim() === '') {
		return { ok: false, reason: 'missing' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ok: false, reason: 'malformed' };
	}

	if (!Array.isArray(parsed)) {
		return { ok: false, reason: 'malformed' };
	}

	const days: PickedServiceDay[] = [];
	const seen = new Set<string>();
	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) {
			return { ok: false, reason: 'malformed' };
		}
		const { date, kinds } = entry as { date?: unknown; kinds?: unknown };
		if (typeof date !== 'string' || !isValidDayKey(date)) {
			return { ok: false, reason: 'invalid-date' };
		}
		if (seen.has(date)) {
			return { ok: false, reason: 'duplicate-day' };
		}
		if (!Array.isArray(kinds)) {
			return { ok: false, reason: 'malformed' };
		}
		if (kinds.length === 0) {
			return { ok: false, reason: 'day-without-service' };
		}
		const normalized: ServiceKind[] = [];
		for (const kind of kinds) {
			if (kind !== 'lunch' && kind !== 'dinner') {
				return { ok: false, reason: 'malformed' };
			}
			if (!normalized.includes(kind)) {
				normalized.push(kind);
			}
		}
		seen.add(date);
		days.push({ date, kinds: normalized.sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b]) });
	}

	if (days.length === 0) {
		return { ok: false, reason: 'empty' };
	}

	days.sort((a, b) => a.date.localeCompare(b.date));
	return { ok: true, days };
}

/** French admin copy for each way the `days` payload can be invalid. */
export function pickedDaysErrorMessage(reason: PickedDaysParseFailure): string {
	switch (reason) {
		case 'missing':
			return 'Les jours de l’événement sont requis.';
		case 'malformed':
			return 'Les jours de l’événement sont invalides.';
		case 'invalid-date':
			return 'Un des jours sélectionnés n’est pas une date valide.';
		case 'duplicate-day':
			return 'Un des jours apparaît plusieurs fois dans la sélection.';
		case 'empty':
			return 'Sélectionnez au moins un jour sur le calendrier.';
		case 'day-without-service':
			return 'Cochez au moins un repas (déjeuner ou dîner) pour chaque jour sélectionné.';
	}
}

/** The Event's current Days and their Services, as the planner sees them. */
export interface CurrentScheduleNode {
	dayId: string;
	date: string;
	services: { serviceId: string; kind: ServiceKind }[];
}

export interface PlannedScheduleChange {
	/** Day keys to insert (Event + date). */
	daysToAdd: string[];
	/** Services to insert (Day picked for the first time with that meal). */
	servicesToAdd: { date: string; kind: ServiceKind }[];
	/** Services whose Day or meal was un-picked; their Seatings cascade. */
	serviceIdsToRemove: string[];
	/** Days that were un-picked entirely. */
	dayIdsToRemove: string[];
}

/**
 * Diff the Event's current Days/Services against the picked set. Pure: the
 * caller combines this with reservation counts to decide whether the
 * removals are allowed, then applies them inside a transaction.
 */
export function planScheduleChange(
	current: CurrentScheduleNode[],
	picked: PickedServiceDay[]
): PlannedScheduleChange {
	// Sorted so the plan does not depend on the order the picker posted;
	// kind order inside a Day is normalised by the parser.
	const pickedByDate = new Map(
		[...picked]
			.sort((a, b) => a.date.localeCompare(b.date))
			.map((day) => [day.date, new Set(day.kinds)])
	);

	const daysToAdd: string[] = [];
	const servicesToAdd: { date: string; kind: ServiceKind }[] = [];
	const serviceIdsToRemove: string[] = [];
	const dayIdsToRemove: string[] = [];

	for (const node of current) {
		const kinds = pickedByDate.get(node.date);
		if (!kinds) {
			dayIdsToRemove.push(node.dayId);
			for (const service of node.services) {
				serviceIdsToRemove.push(service.serviceId);
			}
			continue;
		}
		for (const service of node.services) {
			if (!kinds.has(service.kind)) {
				serviceIdsToRemove.push(service.serviceId);
			}
		}
	}

	for (const [date, kinds] of pickedByDate) {
		const node = current.find((candidate) => candidate.date === date);
		if (!node) {
			daysToAdd.push(date);
			for (const kind of ORDERED_SERVICE_KINDS) {
				if (kinds.has(kind)) {
					servicesToAdd.push({ date, kind });
				}
			}
			continue;
		}
		for (const kind of ORDERED_SERVICE_KINDS) {
			if (kinds.has(kind) && !node.services.some((service) => service.kind === kind)) {
				servicesToAdd.push({ date, kind });
			}
		}
	}

	return {
		daysToAdd: daysToAdd.sort(),
		servicesToAdd,
		serviceIdsToRemove,
		dayIdsToRemove,
	};
}

/**
 * Why a picked set cannot be saved: a removed Day or Service still has
 * Reservations pointing at its Seatings. `kind: null` means the whole Day
 * is being removed.
 */
export interface ScheduleRemovalBlocker {
	date: string;
	kind: ServiceKind | null;
	/** pending/processing/confirmed Reservations — a booked guest. */
	liveCount: number;
	/** Every Reservation row: history keeps its foreign keys, so even
	 * cancelled or expired Reservations block the removal. */
	totalCount: number;
}

/** Thrown by {@link saveEventSchedule} when a removal is refused. */
export class ScheduleRemovalRefusedError extends Error {
	constructor(public readonly blockers: ScheduleRemovalBlocker[]) {
		super(formatRemovalRefusal(blockers));
		this.name = 'ScheduleRemovalRefusedError';
	}
}

function blockerDateLabel(date: string): string {
	return new Intl.DateTimeFormat('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(`${date}T12:00:00Z`));
}

function formatRemovalRefusal(blockers: ScheduleRemovalBlocker[]): string {
	const parts = blockers.map((blocker) => {
		const what =
			blocker.kind === null
				? `la journée du ${blockerDateLabel(blocker.date)}`
				: blocker.kind === 'lunch'
					? `le déjeuner du ${blockerDateLabel(blocker.date)}`
					: `le dîner du ${blockerDateLabel(blocker.date)}`;
		const count = blocker.liveCount > 0 ? blocker.liveCount : blocker.totalCount;
		const plural = count > 1 ? 's' : '';
		const which =
			blocker.liveCount > 0
				? `${count} réservation${plural} en cours`
				: `${count} réservation${plural} passée${plural}`;
		return `${what} (${which})`;
	});
	return `Impossible de retirer ${parts.join(' ; ')}. Les jours et repas concernés doivent être conservés.`;
}

function dayKeyOf(date: string | Date): string {
	return typeof date === 'string' ? date : utcDayKey(date);
}

/**
 * Save the Days and lunch/dinner Services picked on the admin form in one
 * transaction (the “Event schedule” deep module, PRD): missing Days and
 * Services are created, un-picked ones are deleted (their Seatings
 * cascade), the Event's start/end dates are recomputed from its first and
 * last Day. Removing a Day or Service that still has Reservations is
 * refused with a French message; nothing is written in that case.
 */
export async function saveEventSchedule(eventId: string, picked: PickedServiceDay[]): Promise<void> {
	for (const day of picked) {
		if (!isValidDayKey(day.date)) {
			throw new Error(`Invalid day key: ${day.date}`);
		}
		if (
			day.kinds.length === 0 ||
			day.kinds.some((kind) => kind !== 'lunch' && kind !== 'dinner')
		) {
			throw new Error(`Day ${day.date} needs at least one service kind`);
		}
	}

	await db.transaction(async (tx: typeof db) => {
		const [event] = await tx.select({ id: events.id })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1);
		if (!event) {
			throw new Error('Event not found');
		}

		const dayRows: { id: string; date: string | Date }[] = await tx.select({ id: eventDays.id, date: eventDays.date })
			.from(eventDays)
			.where(eq(eventDays.eventId, eventId))
			.orderBy(eventDays.date);
		const serviceRows: { id: string; dayId: string; kind: ServiceKind }[] = await tx
			.select({ id: eventServices.id, dayId: eventServices.dayId, kind: eventServices.kind })
			.from(eventServices)
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventDays.eventId, eventId));

		const current: CurrentScheduleNode[] = dayRows.map((day) => ({
			dayId: day.id,
			date: dayKeyOf(day.date),
			services: serviceRows
				.filter((service) => service.dayId === day.id)
				.map((service) => ({ serviceId: service.id, kind: service.kind })),
		}));

		const plan = planScheduleChange(current, picked);

		if (plan.serviceIdsToRemove.length > 0) {
			const counts = await tx
				.select({
					serviceId: eventSessions.serviceId,
					liveCount: sql<number>`(count(*) FILTER (WHERE ${inArray(reservations.status, LIVE_RESERVATION_STATUSES)}))::int`,
					totalCount: sql<number>`(count(${reservations.id}))::int`,
				})
				.from(eventSessions)
				.leftJoin(reservations, eq(reservations.eventSessionId, eventSessions.id))
				.where(inArray(eventSessions.serviceId, plan.serviceIdsToRemove))
				.groupBy(eventSessions.serviceId);

			const removedDayIds = new Set(plan.dayIdsToRemove);
			const blockers = new Map<string, ScheduleRemovalBlocker>();
			for (const count of counts) {
				// A removed Service with Seatings but no Reservations at all is
				// fine to delete — only booked or historically booked ones block.
				if (count.liveCount === 0 && count.totalCount === 0) {
					continue;
				}
				const node = current.find((candidate) =>
					candidate.services.some((service) => service.serviceId === count.serviceId)
				)!;
				const kind = node.services.find((service) => service.serviceId === count.serviceId)!.kind;
				const dayRemoved = removedDayIds.has(node.dayId);
				const key = dayRemoved ? node.date : `${node.date}:${kind}`;
				const blocker = blockers.get(key) ?? {
					date: node.date,
					kind: dayRemoved ? null : kind,
					liveCount: 0,
					totalCount: 0,
				};
				blocker.liveCount += count.liveCount;
				blocker.totalCount += count.totalCount;
				blockers.set(key, blocker);
			}

			if (blockers.size > 0) {
				throw new ScheduleRemovalRefusedError(
					[...blockers.values()].sort((a, b) => a.date.localeCompare(b.date))
				);
			}
		}

		// Services first, then Days: a removed Day's Services were all listed
		// for removal above, so nothing is left dangling when the Day goes.
		if (plan.serviceIdsToRemove.length > 0) {
			await tx.delete(eventServices)
				.where(inArray(eventServices.id, plan.serviceIdsToRemove));
		}
		if (plan.dayIdsToRemove.length > 0) {
			await tx.delete(eventDays)
				.where(inArray(eventDays.id, plan.dayIdsToRemove));
		}

		if (plan.daysToAdd.length > 0) {
			await tx.insert(eventDays)
				.values(plan.daysToAdd.map((date) => ({ eventId, date })))
				.onConflictDoNothing();
		}
		if (plan.servicesToAdd.length > 0) {
			const dayIdByDate = new Map(
				((await tx.select({ id: eventDays.id, date: eventDays.date })
					.from(eventDays)
					.where(eq(eventDays.eventId, eventId))) as { id: string; date: string | Date }[])
				.map((day) => [dayKeyOf(day.date), day.id])
			);
			await tx.insert(eventServices)
				.values(plan.servicesToAdd.map(({ date, kind }) => ({
					dayId: dayIdByDate.get(date)!,
					kind,
					defaultSeatingDurationMinutes: DEFAULT_SERVICE_DURATION_MINUTES[kind],
				})))
				.onConflictDoNothing();
		}

		await recomputeEventDatesFromDays(tx, eventId);
	});
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

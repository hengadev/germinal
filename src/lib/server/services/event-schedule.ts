import { db } from '../db';
import { eventDays, eventServices, eventSessions, events, reservations } from '../db/schema';
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { EditorService } from '$lib/types/seatings-editor';
import {
	endAfterDuration,
	findSeatingOverlaps,
	formatTimeOfDay,
	LUNCH_DINNER_CUTOFF_HOUR,
	parseTimeOfDay,
	type ServiceKind,
} from '$lib/utils/seating-times';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';

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

// The 16:00 UTC lunch/dinner cut-off (issue 018) lives with the pure
// time-of-day helpers so the admin editor and public labels share it.
export { LUNCH_DINNER_CUTOFF_HOUR, type ServiceKind };

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

/**
 * Thrown by {@link saveEventSchedule} when the picked set cannot be saved;
 * the message is French admin copy and nothing has been written.
 */
export class ScheduleSaveRefusedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ScheduleSaveRefusedError';
	}
}

/** Refused: a removed Day or Service still has Reservations. */
export class ScheduleRemovalRefusedError extends ScheduleSaveRefusedError {
	constructor(public readonly blockers: ScheduleRemovalBlocker[]) {
		super(formatRemovalRefusal(blockers));
		this.name = 'ScheduleRemovalRefusedError';
	}
}

/**
 * Refused: the removals would leave a published Event without any Seating,
 * and a published Event must stay bookable (ADR 0001).
 */
export class PublishedEventWithoutSeatingError extends ScheduleSaveRefusedError {
	constructor() {
		super(
			'Un événement publié doit conserver au moins une séance : ces jours ou repas ne peuvent pas tous être retirés. Dépubliez l’événement d’abord.'
		);
		this.name = 'PublishedEventWithoutSeatingError';
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
		const [event] = await tx.select({ id: events.id, published: events.published })
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
		let removesSeatings = false;

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
			removesSeatings = counts.length > 0;

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

		// Removed Services take their unbooked Seatings with them (cascade):
		// a published Event must keep at least one (ADR 0001). Only checked
		// when Seatings were actually removed; throwing rolls the deletions back.
		if (event.published && removesSeatings) {
			const [remaining] = await tx.select({ id: eventSessions.id })
				.from(eventSessions)
				.where(eq(eventSessions.eventId, eventId))
				.limit(1);
			if (!remaining) {
				throw new PublishedEventWithoutSeatingError();
			}
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
// Seatings per Service (issue 020)
// ---------------------------------------------------------------------------

/** Badge a Seating may carry (display only — see CONTEXT.md "Badge"). */
export type SeatingBadgeType = (typeof eventSessions.$inferSelect)['badgeType'];

const SEATING_BADGE_TYPES: readonly SeatingBadgeType[] = [
	'none', 'featured', 'vip', 'popular', 'best_value', 'limited',
];

// Mirrors config.eventSessions capacity bounds (src/lib/server/env.ts);
// duplicated so the pure parsing helpers stay loadable without env vars.
const MIN_SEATING_CAPACITY = 1;
const MAX_SEATING_CAPACITY = 10000;

/** A Seating as posted by the admin Seatings editor for one Service. */
export interface PlannedSeating {
	/** Existing Seating id, or null to create a new one. */
	id: string | null;
	/** Start time on the Service's Day, `HH:MM` UTC. */
	start: string;
	/** Explicit end `HH:MM` UTC, or null to fill from the default duration. */
	end: string | null;
	titleEn: string | null;
	titleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	totalCapacity: number;
	priceAmount: number;
	currency: string;
	published: boolean;
	allowWaitlist: boolean;
	badgeType: SeatingBadgeType;
}

/** A planned Service with its default duration and its Seatings. */
export interface PlannedServiceSeatings {
	serviceId: string;
	defaultDurationMinutes: number;
	seatings: PlannedSeating[];
}

/** A parsed Seating: the payload entry plus its times as minutes since
 * midnight, with the end filled from the Service's default duration when
 * the payload left it out. */
export interface ParsedSeating {
	seating: PlannedSeating;
	startMinutes: number;
	endMinutes: number;
}

export interface ParsedServiceSeatings {
	serviceId: string;
	defaultDurationMinutes: number;
	seatings: ParsedSeating[];
}

export type SeatingsParseFailure =
	| 'missing'
	| 'malformed'
	| 'service'
	| 'duration'
	| 'time'
	| 'seating';

export type SeatingsParseResult =
	| { ok: true; services: ParsedServiceSeatings[] }
	| { ok: false; reason: SeatingsParseFailure };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(value: unknown, maxLength: number): string | null | false {
	if (value === null) return null;
	if (typeof value !== 'string') return false;
	const trimmed = value.trim();
	if (trimmed.length > maxLength) return false;
	return trimmed === '' ? null : trimmed;
}

/**
 * Parse the `services` payload posted by the admin Seatings editor: one
 * entry per Service with its default Seating duration and its Seatings as
 * start times. Ends left out are filled from the duration; everything is
 * validated (times, duration, capacity, price, currency, badge). Returns a
 * failure reason the admin form maps to French copy.
 */
export function parseSeatingsPayload(raw: string | null): SeatingsParseResult {
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

	const seenServiceIds = new Set<string>();
	const seenSeatingIds = new Set<string>();
	const services: ParsedServiceSeatings[] = [];

	for (const serviceEntry of parsed) {
		if (typeof serviceEntry !== 'object' || serviceEntry === null) {
			return { ok: false, reason: 'malformed' };
		}
		const { serviceId, defaultDurationMinutes, seatings } = serviceEntry as Record<string, unknown>;
		if (typeof serviceId !== 'string' || !UUID_PATTERN.test(serviceId)) {
			return { ok: false, reason: 'service' };
		}
		if (seenServiceIds.has(serviceId)) {
			return { ok: false, reason: 'service' };
		}
		seenServiceIds.add(serviceId);

		if (
			!Number.isInteger(defaultDurationMinutes) ||
			(defaultDurationMinutes as number) < 1 ||
			(defaultDurationMinutes as number) > 24 * 60
		) {
			return { ok: false, reason: 'duration' };
		}
		if (!Array.isArray(seatings)) {
			return { ok: false, reason: 'malformed' };
		}

		const parsedSeatings: ParsedSeating[] = [];
		for (const seatingEntry of seatings) {
			if (typeof seatingEntry !== 'object' || seatingEntry === null) {
				return { ok: false, reason: 'malformed' };
			}
			const entry = seatingEntry as Record<string, unknown>;

			if (entry.id !== null && (typeof entry.id !== 'string' || !UUID_PATTERN.test(entry.id))) {
				return { ok: false, reason: 'seating' };
			}
			if (entry.id !== null) {
				if (seenSeatingIds.has(entry.id)) {
					return { ok: false, reason: 'seating' };
				}
				seenSeatingIds.add(entry.id);
			}

			if (typeof entry.start !== 'string') {
				return { ok: false, reason: 'time' };
			}
			const startMinutes = parseTimeOfDay(entry.start);
			if (startMinutes === null) {
				return { ok: false, reason: 'time' };
			}

			let endMinutes: number;
			if (entry.end === null || entry.end === undefined) {
					// No explicit end: filled from the Service's default duration
					// (the PRD's Event schedule module owns end-time filling).
				const filled = endAfterDuration(startMinutes, defaultDurationMinutes as number);
				if (filled === null) {
					return { ok: false, reason: 'time' };
				}
				endMinutes = filled;
			} else {
				if (typeof entry.end !== 'string') {
					return { ok: false, reason: 'time' };
				}
				const explicit = parseTimeOfDay(entry.end);
				if (explicit === null || explicit <= startMinutes) {
					return { ok: false, reason: 'time' };
				}
				endMinutes = explicit;
			}

			const titleEn = optionalText(entry.titleEn, 255);
			const titleFr = optionalText(entry.titleFr, 255);
			const descriptionEn = optionalText(entry.descriptionEn, 100000);
			const descriptionFr = optionalText(entry.descriptionFr, 100000);
			if (titleEn === false || titleFr === false || descriptionEn === false || descriptionFr === false) {
				return { ok: false, reason: 'seating' };
			}

			if (
				!Number.isInteger(entry.totalCapacity) ||
				(entry.totalCapacity as number) < MIN_SEATING_CAPACITY ||
				(entry.totalCapacity as number) > MAX_SEATING_CAPACITY
			) {
				return { ok: false, reason: 'seating' };
			}
			if (!Number.isInteger(entry.priceAmount) || (entry.priceAmount as number) < 0) {
				return { ok: false, reason: 'seating' };
			}
			if (typeof entry.currency !== 'string' || !/^[a-z]{3}$/i.test(entry.currency)) {
				return { ok: false, reason: 'seating' };
			}
			if (typeof entry.published !== 'boolean' || typeof entry.allowWaitlist !== 'boolean') {
				return { ok: false, reason: 'seating' };
			}
			if (!SEATING_BADGE_TYPES.includes(entry.badgeType as SeatingBadgeType)) {
				return { ok: false, reason: 'seating' };
			}

			parsedSeatings.push({
				seating: {
					id: entry.id as string | null,
					start: entry.start,
					end: entry.end === null || entry.end === undefined ? null : (entry.end as string),
					titleEn,
					titleFr,
					descriptionEn,
					descriptionFr,
					totalCapacity: entry.totalCapacity as number,
					priceAmount: entry.priceAmount as number,
					currency: (entry.currency as string).toUpperCase(),
					published: entry.published as boolean,
					allowWaitlist: entry.allowWaitlist as boolean,
					badgeType: entry.badgeType as SeatingBadgeType,
				},
				startMinutes,
				endMinutes,
			});
		}

		services.push({
			serviceId,
			defaultDurationMinutes: defaultDurationMinutes as number,
			seatings: parsedSeatings,
		});
	}

	return { ok: true, services };
}

/** French admin copy for each way the seatings payload can be invalid. */
export function seatingsPayloadErrorMessage(reason: SeatingsParseFailure): string {
	switch (reason) {
		case 'missing':
			return 'Les séances de l’événement sont requises.';
		case 'malformed':
			return 'Les séances soumises sont invalides.';
		case 'service':
			return 'Un des services soumis est invalide.';
		case 'duration':
			return 'La durée par défaut doit être un nombre entier de minutes, entre 1 et 1440.';
		case 'time':
			return 'Les heures de séance sont invalides : saisissez HH:MM en UTC, fin après le début et avant minuit.';
		case 'seating':
			return 'Une des séances est invalide (titre, capacité, prix, devise ou badge).';
	}
}

/** A planned Seating that starts before an earlier Seating of the same
 * Service has ended — reported (warned), never refused (PRD). */
export interface PlannedSeatingOverlapWarning {
	serviceIndex: number;
	seatingIndex: number;
	/** Flagged Seating's start, `HH:MM`. */
	start: string;
	/** End of the earlier Seating it collides with, `HH:MM`. */
	previousEnd: string;
}

/**
 * Detect overlapping Seatings in a parsed payload, Service by Service.
 * Pure — the save reports the result, the admin form can show the same
 * warnings before saving.
 */
export function findPlannedSeatingOverlaps(
	services: ParsedServiceSeatings[]
): PlannedSeatingOverlapWarning[] {
	const warnings: PlannedSeatingOverlapWarning[] = [];
	services.forEach((service, serviceIndex) => {
		const hits = findSeatingOverlaps(
			service.seatings.map((seating) => ({
				startMinutes: seating.startMinutes,
				endMinutes: seating.endMinutes,
			}))
		);
		for (const hit of hits) {
			warnings.push({
				serviceIndex,
				seatingIndex: hit.index,
				start: formatTimeOfDay(service.seatings[hit.index].startMinutes),
				previousEnd: formatTimeOfDay(hit.previousEndMinutes),
			});
		}
	});
	return warnings;
}

function frClock(time: string): string {
	return time.replace(':', 'h');
}

/** French admin copy for reported overlaps (a warning, not a refusal). */
export function formatSeatingOverlapWarning(warnings: PlannedSeatingOverlapWarning[]): string {
	const parts = warnings.map((warning) =>
		`la séance de ${frClock(warning.start)} commence avant la fin de la précédente (${frClock(warning.previousEnd)})`
	);
	return `Chevauchement de séances dans un même repas : ${parts.join(' ; ')}.`;
}

// ---------------------------------------------------------------------------
// Derived Seating titles (issue 020) — pure, shared with the client.
// ---------------------------------------------------------------------------

export {
	derivedSeatingTitle,
	seatingTitle,
	seatingTitlesWithFallback,
	type SeatingLabelContext,
} from '$lib/utils/seating-title';

/**
 * Refused: publishing an Event that has no Seating — every published Event
 * must be bookable (ADR 0001).
 */
export class EventWithoutSeatingError extends ScheduleSaveRefusedError {
	constructor() {
		super(
			'Un événement ne peut pas être publié sans au moins une séance. Ajoutez une séance dans l’onglet Séances, puis publiez à nouveau.'
		);
		this.name = 'EventWithoutSeatingError';
	}
}

/** Throw {@link EventWithoutSeatingError} unless the Event has a Seating. */
export async function assertEventHasSeatings(eventId: string): Promise<void> {
	const [seating] = await db.select({ id: eventSessions.id })
		.from(eventSessions)
		.where(eq(eventSessions.eventId, eventId))
		.limit(1);
	if (!seating) {
		throw new EventWithoutSeatingError();
	}
}

// ---------------------------------------------------------------------------
// Saving the admin Seatings editor (issue 020)
// ---------------------------------------------------------------------------

/** Full UTC instant of `minutes` since midnight on `day`. */
function seatingInstantUtc(day: string, minutes: number): Date {
	return new Date(`${day}T${formatTimeOfDay(minutes)}:00.000Z`);
}

/** A Seating that cannot be deleted because Reservations still point at
 * it. The Reservations foreign key is RESTRICT, so even past (cancelled or
 * expired) Reservations keep the Seating row — the guest's history keeps
 * its reference (same principle as saveEventSchedule's Day/Service guard). */
export interface SeatingRemovalBlocker {
	date: string;
	kind: ServiceKind;
	/** `HH:MM` start of the Seating. */
	start: string;
	liveCount: number;
	totalCount: number;
}

/**
 * Thrown by {@link saveServiceSeatings} when the payload cannot be saved;
 * the message is French admin copy and nothing has been written.
 */
export class SeatingSaveRefusedError extends ScheduleSaveRefusedError {
	constructor(message: string) {
		super(message);
		this.name = 'SeatingSaveRefusedError';
	}
}

/** Refused: the payload names a Service or Seating outside this Event. */
export class UnknownScheduleServiceError extends SeatingSaveRefusedError {
	constructor() {
		super('Impossible d’enregistrer : un des services ou séances soumis n’appartient pas à cet événement.');
		this.name = 'UnknownScheduleServiceError';
	}
}

/** Refused: a dropped Seating still has Reservations. */
export class SeatingRemovalRefusedError extends SeatingSaveRefusedError {
	constructor(public readonly blockers: SeatingRemovalBlocker[]) {
		super(formatSeatingRemovalRefusal(blockers));
		this.name = 'SeatingRemovalRefusedError';
	}
}

function formatSeatingRemovalRefusal(blockers: SeatingRemovalBlocker[]): string {
	const parts = blockers.map((blocker) => {
		const meal = blocker.kind === 'lunch' ? 'déjeuner' : 'dîner';
		const count = blocker.liveCount > 0 ? blocker.liveCount : blocker.totalCount;
		const plural = count > 1 ? 's' : '';
		const which = blocker.liveCount > 0
			? `${count} réservation${plural} en cours`
			: `${count} réservation${plural} passée${plural}`;
		return `la séance de ${frClock(blocker.start)} du ${meal} du ${blockerDateLabel(blocker.date)} (${which})`;
	});
	return `Impossible de supprimer ${parts.join(' ; ')}. Les séances concernées doivent être conservées.`;
}

/** A Seating whose start time classifies as the other meal than the
 * Service it was planned under. */
export interface SeatingServiceMismatch {
	date: string;
	kind: ServiceKind;
	start: string;
}

/** Refused: a Seating's start does not match its Service's meal — the
 * 16:00 UTC cut-off decides which meal a time belongs to. */
export class SeatingServiceMismatchError extends SeatingSaveRefusedError {
	constructor(public readonly mismatches: SeatingServiceMismatch[]) {
		super(formatSeatingServiceMismatch(mismatches));
		this.name = 'SeatingServiceMismatchError';
	}
}

function formatSeatingServiceMismatch(mismatches: SeatingServiceMismatch[]): string {
	const parts = mismatches.map((mismatch) => {
		const meal = mismatch.kind === 'lunch' ? 'déjeuner' : 'dîner';
		const window = mismatch.kind === 'lunch'
			? 'avant 16:00 UTC'
			: 'à partir de 16:00 UTC';
		return `la séance de ${frClock(mismatch.start)} du ${meal} du ${blockerDateLabel(mismatch.date)} doit commencer ${window}`;
	});
	return `Un horaire ne correspond pas à son repas : ${parts.join(' ; ')}.`;
}

/** A Seating whose capacity would drop below its confirmed seats. */
export interface SeatingCapacityBlocker {
	date: string;
	kind: ServiceKind;
	start: string;
	requestedCapacity: number;
	soldCount: number;
}

/** Refused: lowering a Seating's capacity below the seats already sold. */
export class SeatingCapacityRefusedError extends SeatingSaveRefusedError {
	constructor(public readonly blockers: SeatingCapacityBlocker[]) {
		super(formatSeatingCapacityRefusal(blockers));
		this.name = 'SeatingCapacityRefusedError';
	}
}

function formatSeatingCapacityRefusal(blockers: SeatingCapacityBlocker[]): string {
	const parts = blockers.map((blocker) => {
		const meal = blocker.kind === 'lunch' ? 'déjeuner' : 'dîner';
		return `la séance de ${frClock(blocker.start)} du ${meal} du ${blockerDateLabel(blocker.date)} (${blocker.soldCount} place${blocker.soldCount > 1 ? 's' : ''} déjà réservée${blocker.soldCount > 1 ? 's' : ''}, capacité demandée : ${blocker.requestedCapacity})`;
	});
	return `Impossible de réduire la capacité : ${parts.join(' ; ')}.`;
}

export interface SavedSeatings {
	/** Seatings starting before the previous one ends — reported as a
	 * warning, never a refusal (PRD “reports overlapping Seatings”). */
	overlaps: PlannedSeatingOverlapWarning[];
	/** Ids of the Seatings deleted by this save (for the audit log). */
	removedSeatingIds: string[];
}

/**
 * Save the admin Seatings editor in one transaction (the “Event schedule”
 * deep module, PRD): each planned Service gets its default Seating
 * duration, new Seatings (entered as start times, ends filled from the
 * duration) are created, kept Seatings are updated, dropped Seatings are
 * deleted. Refuses — with a French message and nothing written — to delete
 * a Seating that still has Reservations, to lower a capacity below the
 * seats already sold, and to leave a published Event without any Seating
 * (ADR 0001). Overlapping Seatings within a Service are reported in the
 * result instead of refused.
 *
 * Days and Services are never created or removed here: they are picked on
 * the Days picker (issue 019), so this save only reconciles Seatings
 * underneath them.
 */
export async function saveServiceSeatings(
	eventId: string,
	services: ParsedServiceSeatings[]
): Promise<SavedSeatings> {
	const removedSeatingIds: string[] = await db.transaction(async (tx: typeof db) => {
		const [event] = await tx.select({ id: events.id, published: events.published })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1);
		if (!event) {
			throw new Error('Event not found');
		}

		const serviceRows: { id: string; kind: ServiceKind; date: string }[] = await tx.select({
			id: eventServices.id,
			kind: eventServices.kind,
			date: sql<string>`${eventDays.date}::text`,
		})
			.from(eventServices)
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventDays.eventId, eventId));
		const serviceById = new Map(serviceRows.map((row) => [row.id, row]));

		// Locked like a booking locks its Seating, so seats held below stay
		// exact while this transaction runs.
		const sessionRows: {
			id: string;
			serviceId: string;
			startTime: Date;
			totalCapacity: number;
			availableCapacity: number;
		}[] = await tx.select({
			id: eventSessions.id,
			serviceId: eventSessions.serviceId,
			startTime: eventSessions.startTime,
			totalCapacity: eventSessions.totalCapacity,
			availableCapacity: eventSessions.availableCapacity,
		})
			.from(eventSessions)
			.where(eq(eventSessions.eventId, eventId))
			.for('update');
		const sessionById = new Map(sessionRows.map((row) => [row.id, row]));
		// Seats held on a Seating: every pending, processing or confirmed
		// Reservation decremented available capacity by its quantity when it
		// was created, and expiry/cancellation gives the seats back.
		const heldSeats = (sessionId: string): number => {
			const row = sessionById.get(sessionId);
			return row ? row.totalCapacity - row.availableCapacity : 0;
		};

		const counts: {
			sessionId: string;
			liveCount: number;
			totalCount: number;
		}[] = sessionRows.length > 0
			? await tx.select({
					sessionId: reservations.eventSessionId,
					liveCount: sql<number>`(count(*) FILTER (WHERE ${inArray(reservations.status, LIVE_RESERVATION_STATUSES)}))::int`,
					totalCount: sql<number>`(count(${reservations.id}))::int`,
				})
				.from(reservations)
				.where(inArray(reservations.eventSessionId, sessionRows.map((row) => row.id)))
				.groupBy(reservations.eventSessionId)
			: [];
		const countsBySession = new Map(counts.map((count) => [count.sessionId, count]));

		// Every planned Service and Seating must belong to this Event, and
		// every Seating's start must classify as its Service's meal.
		const plannedServiceIds = new Set<string>();
		const mismatches: SeatingServiceMismatch[] = [];
		for (const service of services) {
			const row = serviceById.get(service.serviceId);
			if (!row) {
				throw new UnknownScheduleServiceError();
			}
			plannedServiceIds.add(row.id);
			for (const seating of service.seatings) {
				if (seating.seating.id !== null && sessionById.get(seating.seating.id)?.serviceId !== row.id) {
					throw new UnknownScheduleServiceError();
				}
				if (classifyServiceKind(seatingInstantUtc(row.date, seating.startMinutes)) !== row.kind) {
					mismatches.push({ date: row.date, kind: row.kind, start: seating.seating.start });
				}
			}
		}
		if (mismatches.length > 0) {
			throw new SeatingServiceMismatchError(
				mismatches.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
			);
		}

		// Dropped Seatings: those of the planned Services that the payload no
		// longer lists. Seatings of Services outside the payload are untouched.
		const keepIds = new Set<string>();
		let insertCount = 0;
		for (const service of services) {
			for (const seating of service.seatings) {
				if (seating.seating.id !== null) {
					keepIds.add(seating.seating.id);
				} else {
					insertCount++;
				}
			}
		}

		const removalBlockers: SeatingRemovalBlocker[] = [];
		const removedIds: string[] = [];
		for (const session of sessionRows) {
			if (!plannedServiceIds.has(session.serviceId) || keepIds.has(session.id)) {
				continue;
			}
			const count = countsBySession.get(session.id);
			if (count && count.totalCount > 0) {
				const row = serviceById.get(session.serviceId)!;
				removalBlockers.push({
					date: row.date,
					kind: row.kind,
					start: formatTimeOfDay(
						session.startTime.getUTCHours() * 60 + session.startTime.getUTCMinutes()
					),
					liveCount: count.liveCount,
					totalCount: count.totalCount,
				});
			} else {
				removedIds.push(session.id);
			}
		}
		if (removalBlockers.length > 0) {
			throw new SeatingRemovalRefusedError(
				removalBlockers.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
			);
		}

		// Capacity may never drop below the seats already sold.
		const capacityBlockers: SeatingCapacityBlocker[] = [];
		for (const service of services) {
			const row = serviceById.get(service.serviceId)!;
			for (const seating of service.seatings) {
				if (seating.seating.id === null) continue;
				const held = heldSeats(seating.seating.id);
				if (seating.seating.totalCapacity < held) {
					capacityBlockers.push({
						date: row.date,
						kind: row.kind,
						start: seating.seating.start,
						requestedCapacity: seating.seating.totalCapacity,
						soldCount: held,
					});
				}
			}
		}
		if (capacityBlockers.length > 0) {
			throw new SeatingCapacityRefusedError(
				capacityBlockers.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
			);
		}

		// A published Event must keep at least one Seating (ADR 0001).
		if (event.published && sessionRows.length - removedIds.length + insertCount === 0) {
			throw new PublishedEventWithoutSeatingError();
		}

		// Apply: default durations, then Seatings (updates and inserts), then
		// deletions.
		for (const service of services) {
			const row = serviceById.get(service.serviceId)!;
			await tx.update(eventServices)
				.set({
					defaultSeatingDurationMinutes: service.defaultDurationMinutes,
					updatedAt: new Date(),
				})
				.where(eq(eventServices.id, service.serviceId));

			for (const seating of service.seatings) {
				const startTime = seatingInstantUtc(row.date, seating.startMinutes);
				const endTime = seatingInstantUtc(row.date, seating.endMinutes);
				const fields = {
					titleEn: seating.seating.titleEn,
					titleFr: seating.seating.titleFr,
					descriptionEn: seating.seating.descriptionEn,
					descriptionFr: seating.seating.descriptionFr,
					startTime,
					endTime,
					totalCapacity: seating.seating.totalCapacity,
					priceAmount: seating.seating.priceAmount,
					currency: seating.seating.currency,
					published: seating.seating.published,
					allowWaitlist: seating.seating.allowWaitlist,
					badgeType: seating.seating.badgeType,
				};

				if (seating.seating.id === null) {
					await tx.insert(eventSessions).values({
						eventId,
						serviceId: service.serviceId,
						...fields,
						// A new Seating has no Reservations: all seats are available.
						availableCapacity: seating.seating.totalCapacity,
					});
				} else {
					// Seats already held stay held; only the new total moves
					// the available count.
					await tx.update(eventSessions)
						.set({
							...fields,
							availableCapacity: seating.seating.totalCapacity - heldSeats(seating.seating.id),
							updatedAt: new Date(),
					})
						.where(eq(eventSessions.id, seating.seating.id));
				}
			}
		}

		if (removedIds.length > 0) {
			await tx.delete(eventSessions).where(inArray(eventSessions.id, removedIds));
		}
		return removedIds;
	});

	return { overlaps: findPlannedSeatingOverlaps(services), removedSeatingIds };
}

/** `HH:MM` (UTC) of an instant. */
function utcClock(instant: Date): string {
	return formatTimeOfDay(instant.getUTCHours() * 60 + instant.getUTCMinutes());
}

/**
 * The Event's Days → Services → Seatings as the admin Seatings editor
 * shows them (issue 020): Services ordered by Day then meal, Seatings by
 * start, with each Seating's Reservation count (any status — a booked
 * Seating cannot be removed). Services with no Seating yet are included so
 * the Admin can add the first one.
 */
export async function loadSeatingsEditor(eventId: string): Promise<EditorService[]> {
	const serviceRows: { id: string; kind: ServiceKind; date: string; duration: number }[] = await db
		.select({
			id: eventServices.id,
			kind: eventServices.kind,
			date: sql<string>`${eventDays.date}::text`,
			duration: eventServices.defaultSeatingDurationMinutes,
		})
		.from(eventServices)
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(eq(eventDays.eventId, eventId));

	const seatingRows: (typeof eventSessions.$inferSelect & { reservationCount: number })[] = await db
		.select({
			...getTableColumns(eventSessions),
			reservationCount: sql<number>`(SELECT count(*) FROM reservations r WHERE r.event_session_id = "event_sessions"."id")::int`,
		})
		.from(eventSessions)
		.where(eq(eventSessions.eventId, eventId))
		.orderBy(eventSessions.startTime);

	return serviceRows
		.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
		.map((service) => ({
			serviceId: service.id,
			date: service.date,
			kind: service.kind,
			defaultDurationMinutes: service.duration,
			seatings: seatingRows
				.filter((seating) => seating.serviceId === service.id)
				.map((seating) => ({
					id: seating.id,
					start: utcClock(seating.startTime),
					end: utcClock(seating.endTime),
					titleEn: seating.titleEn,
					titleFr: seating.titleFr,
					descriptionEn: seating.descriptionEn,
					descriptionFr: seating.descriptionFr,
					totalCapacity: seating.totalCapacity,
					availableCapacity: seating.availableCapacity,
					priceAmount: seating.priceAmount,
					currency: seating.currency,
					published: seating.published,
					allowWaitlist: seating.allowWaitlist,
					badgeType: seating.badgeType,
					reservationCount: seating.reservationCount,
				})),
		}));
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
): Promise<ScheduleRow<typeof eventSessions.$inferSelect & { titleEn: string; titleFr: string }>[]> {
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
		// Untitled Seatings get a label derived from Day, Service and time
		// (issue 020) — the grouping context is already loaded here.
		item: {
			...row.session,
			...seatingTitlesWithFallback(row.session, {
				dayDate: row.dayDate,
				serviceKind: row.serviceKind,
			}),
		},
	}));
}

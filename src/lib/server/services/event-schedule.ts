import type { BookingWindow } from '$lib/utils/booking-window';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, events, reservations } from '../db/schema';
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { EditorService } from '$lib/types/seatings-editor';
import {
	DEFAULT_SERVICE_DURATION_MINUTES,
	endAfterDuration,
	findSeatingOverlaps,
	formatTimeOfDay,
	parseTimeOfDay,
} from '$lib/utils/seating-times';
import {
	clockOf,
	dayEnd,
	dayOf,
	dayStart,
	formatDayKey,
	isValidTimeZone,
	LUNCH_DINNER_CUTOFF_HOUR,
	reconvertInstants,
	serviceKindOf,
	serviceKindOfMinutes,
	wallClockToInstant,
	type ServiceKind,
} from '$lib/utils/event-time';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';
import { resolveSeatingPrice, type SeatingPrice } from '$lib/utils/seating-price';

/**
 * Event schedule — the Days → Services → Seatings model (ADR 0005).
 *
 * This module owns the rules that derive a Seating's place in the schedule
 * from its start time, the find-or-attach logic that keeps every Seating
 * parented to exactly one Service, and the recomputation of an Event's
 * start/end dates from its first and last Day.
 *
 * Seatings are stored as UTC instants, but Day boundaries, wall-clock
 * times and the 16:00 lunch/dinner cut-off are read in the Event's Time
 * Zone (ADR 0006) through the Event time module ($lib/utils/event-time).
 */

export { DEFAULT_SERVICE_DURATION_MINUTES, LUNCH_DINNER_CUTOFF_HOUR, type ServiceKind };

const KIND_ORDER: Record<ServiceKind, number> = { lunch: 0, dinner: 1 };

const ORDERED_SERVICE_KINDS: ServiceKind[] = ['lunch', 'dinner'];

/**
 * Reservations that still count against a Day/Service being removed: a
 * guest is booked (or booking) and must never be orphaned.
 */
const LIVE_RESERVATION_STATUSES = ['pending', 'processing', 'confirmed'] as const;

/** Duration of a Seating in whole minutes, rounded up, at least one. */
export function seatingDurationMinutes(startTime: Date, endTime: Date): number {
	return Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 60000));
}

/** The Event's Time Zone (ADR 0006). */
async function eventTimeZone(tx: typeof db, eventId: string): Promise<string> {
	const [event] = await tx.select({ timeZone: events.timeZone })
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);
	if (!event) {
		throw new Error('Event not found');
	}
	return event.timeZone;
}

/**
 * Recompute an Event's start/end dates from its Days: the Event starts at
 * midnight of its first Day and ends at the last instant of its last Day,
 * in its Time Zone. Events is updated in place; an Event with no Days
 * keeps its current dates (nothing to derive from yet).
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

	const zone = await eventTimeZone(tx, eventId);
	await tx.update(events)
		.set({
			startDate: dayStart(bounds.minDate, zone),
			endDate: dayEnd(bounds.maxDate, zone),
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
	const zone = await eventTimeZone(tx, eventId);
	const [day] = await tx
		.insert(eventDays)
		.values({ eventId, date: dayOf(startTime, zone) })
		.onConflictDoUpdate({
			target: [eventDays.eventId, eventDays.date],
			set: { updatedAt: new Date() },
		})
		.returning();

	const [service] = await tx
		.insert(eventServices)
		.values({
			dayId: day.id,
			kind: serviceKindOf(startTime, zone),
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
	return formatDayKey(date, 'fr');
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

/** A `date` column's value as a Day key (`YYYY-MM-DD`): a calendar date,
 * whichever form the driver returns it in. */
function dayKeyOf(date: string | Date): string {
	return typeof date === 'string' ? date : date.toISOString().slice(0, 10);
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
		const [event] = await tx.select({ id: events.id, visibility: events.visibility })
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
		if (event.visibility !== 'draft' && removesSeatings) {
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
// They bound the Venue Capacity as well as a Seating's own capacity.
const MIN_SEATING_CAPACITY = 1;
const MAX_SEATING_CAPACITY = 10000;

function isValidCapacity(value: unknown): value is number {
	return Number.isInteger(value) &&
		(value as number) >= MIN_SEATING_CAPACITY &&
		(value as number) <= MAX_SEATING_CAPACITY;
}

export type VenueCapacityParseResult =
	| { ok: true; venueCapacity: number | undefined }
	| { ok: false };

/**
 * Parse the Venue Capacity posted by an admin form (issue 021): a whole
 * number of guests between 1 and 10 000. An absent or blank value means
 * “leave the Event's Venue Capacity as it is” (`undefined`).
 */
export function parseVenueCapacity(raw: string | null): VenueCapacityParseResult {
	if (raw === null || raw.trim() === '') {
		return { ok: true, venueCapacity: undefined };
	}
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) {
		return { ok: false };
	}
	const value = Number(trimmed);
	return isValidCapacity(value) ? { ok: true, venueCapacity: value } : { ok: false };
}

/** French admin copy for an invalid Venue Capacity. */
export const VENUE_CAPACITY_ERROR_MESSAGE =
	'La capacité du lieu doit être un nombre entier de places, entre 1 et 10 000.';

/** A Seating as posted by the admin Seatings editor for one Service. */
export interface PlannedSeating {
	/** Existing Seating id, or null to create a new one. */
	id: string | null;
	/** Start time on the Service's Day, `HH:MM` in the Event's Time Zone. */
	start: string;
	/** Explicit end `HH:MM` (Event's Time Zone), or null to fill from the
	 * default duration. */
	end: string | null;
	titleEn: string | null;
	titleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	/** The Seating's own capacity, or null to inherit the Event's Venue
	 * Capacity (issue 021). */
	capacityOverride: number | null;
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
 * validated (times, duration, capacity, badge). Prices are not part of the
 * payload: they live on the Service (issue 022). Returns a
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

			if (entry.capacityOverride !== null && !isValidCapacity(entry.capacityOverride)) {
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
					capacityOverride: entry.capacityOverride as number | null,
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
			return 'Les heures de séance sont invalides : saisissez HH:MM, fin après le début et avant minuit.';
		case 'seating':
			return 'Une des séances est invalide (titre, capacité ou badge).';
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
 * 16:00 cut-off, on the Event's clock, decides which meal a time belongs to. */
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
			? 'avant 16h00'
			: 'à partir de 16h00';
		return `la séance de ${frClock(mismatch.start)} du ${meal} du ${blockerDateLabel(mismatch.date)} doit commencer ${window}`;
	});
	return `Un horaire ne correspond pas à son repas : ${parts.join(' ; ')}.`;
}

/** A Seating whose capacity would drop below the seats it holds. */
export interface SeatingCapacityBlocker {
	date: string;
	kind: ServiceKind;
	start: string;
	requestedCapacity: number;
	/** Seats held: pending, processing and confirmed Reservations. */
	soldCount: number;
	/** The capacity comes from the Event's Venue Capacity (no override). */
	inherited: boolean;
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
		const requested = blocker.inherited ? 'capacité du lieu demandée' : 'capacité demandée';
		return `la séance de ${frClock(blocker.start)} du ${meal} du ${blockerDateLabel(blocker.date)} (${blocker.soldCount} place${blocker.soldCount > 1 ? 's' : ''} déjà réservée${blocker.soldCount > 1 ? 's' : ''}, ${requested} : ${blocker.requestedCapacity})`;
	});
	return `Impossible de réduire la capacité : ${parts.join(' ; ')}.`;
}

/** Refused: a Seating inherits the Venue Capacity but the Event has none. */
export class VenueCapacityMissingError extends SeatingSaveRefusedError {
	constructor() {
		super('Renseignez la capacité du lieu : les séances sans capacité propre en héritent.');
		this.name = 'VenueCapacityMissingError';
	}
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
 * seats already held, and to leave a published Event without any Seating
 * (ADR 0001). Overlapping Seatings within a Service are reported in the
 * result instead of refused.
 *
 * Capacity (issue 021): a Seating either overrides capacity with its own
 * or inherits the Event's Venue Capacity. When `venueCapacity` is given it
 * becomes the Event's Venue Capacity and is propagated to every inheriting
 * Seating of the Event — including those of Services outside the payload.
 * total_capacity stays the effective, booking-time value; available
 * capacity moves with it so the seats already held stay held.
 *
 * Days and Services are never created or removed here: they are picked on
 * the Days picker (issue 019), so this save only reconciles Seatings
 * underneath them.
 */
export async function saveServiceSeatings(
	eventId: string,
	services: ParsedServiceSeatings[],
	venueCapacity?: number
): Promise<SavedSeatings> {
	if (venueCapacity !== undefined && !isValidCapacity(venueCapacity)) {
		throw new Error(`Invalid venue capacity: ${venueCapacity}`);
	}

	const removedSeatingIds: string[] = await db.transaction(async (tx: typeof db) => {
		const [event] = await tx.select({
			id: events.id,
			visibility: events.visibility,
			venueCapacity: events.venueCapacity,
			timeZone: events.timeZone,
		})
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1)
			.for('update');
		if (!event) {
			throw new Error('Event not found');
		}
		// The Venue Capacity every inheriting Seating ends up with.
		const venue: number | null = venueCapacity ?? event.venueCapacity;
		// Times are typed on the Event's clock (ADR 0006).
		const zone: string = event.timeZone;

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
			capacityOverridden: boolean;
		}[] = await tx.select({
			id: eventSessions.id,
			serviceId: eventSessions.serviceId,
			startTime: eventSessions.startTime,
			totalCapacity: eventSessions.totalCapacity,
			availableCapacity: eventSessions.availableCapacity,
			capacityOverridden: eventSessions.capacityOverridden,
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
				if (serviceKindOfMinutes(seating.startMinutes) !== row.kind) {
					mismatches.push({ date: row.date, kind: row.kind, start: seating.seating.start });
				}
			}
		}
		if (mismatches.length > 0) {
			throw new SeatingServiceMismatchError(
				mismatches.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
			);
		}

		// A Seating without its own capacity needs a Venue Capacity to inherit.
		if (
			venue === null &&
			services.some((service) => service.seatings.some((seating) => seating.seating.capacityOverride === null))
		) {
			throw new VenueCapacityMissingError();
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
					start: clockOf(session.startTime, zone),
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

		// Inheriting Seatings of Services outside the payload follow the new
		// Venue Capacity too; overridden ones keep their own capacity.
		const followers = venue === null
			? []
			: sessionRows.filter((session) =>
				!plannedServiceIds.has(session.serviceId) &&
				!session.capacityOverridden &&
				session.totalCapacity !== venue
			);

		// Capacity may never drop below the seats already held — whether the
		// Seating's own capacity or the Venue Capacity it inherits changed.
		const capacityBlockers: SeatingCapacityBlocker[] = [];
		for (const service of services) {
			const row = serviceById.get(service.serviceId)!;
			for (const seating of service.seatings) {
				if (seating.seating.id === null) continue;
				const capacity = seating.seating.capacityOverride ?? venue!;
				const held = heldSeats(seating.seating.id);
				if (capacity < held) {
					capacityBlockers.push({
						date: row.date,
						kind: row.kind,
						start: seating.seating.start,
						requestedCapacity: capacity,
						soldCount: held,
						inherited: seating.seating.capacityOverride === null,
					});
				}
			}
		}
		for (const session of followers) {
			const held = heldSeats(session.id);
			if (venue! < held) {
				const row = serviceById.get(session.serviceId)!;
				capacityBlockers.push({
					date: row.date,
					kind: row.kind,
					start: clockOf(session.startTime, zone),
					requestedCapacity: venue!,
					soldCount: held,
					inherited: true,
				});
			}
		}
		if (capacityBlockers.length > 0) {
			throw new SeatingCapacityRefusedError(
				capacityBlockers.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
			);
		}

		// A published Event must keep at least one Seating (ADR 0001).
		if (
			event.visibility !== 'draft' &&
			removedIds.length > 0 &&
			sessionRows.length - removedIds.length + insertCount === 0
		) {
			throw new PublishedEventWithoutSeatingError();
		}

		// Apply: the Venue Capacity and the Seatings inheriting it outside
		// the payload, default durations, then Seatings (updates and
		// inserts), then deletions.
		if (venueCapacity !== undefined && venueCapacity !== event.venueCapacity) {
			await tx.update(events)
				.set({ venueCapacity, updatedAt: new Date() })
				.where(eq(events.id, eventId));
		}
		for (const session of followers) {
			await tx.update(eventSessions)
				.set({
					totalCapacity: venue!,
					availableCapacity: venue! - heldSeats(session.id),
					updatedAt: new Date(),
				})
				.where(eq(eventSessions.id, session.id));
		}

		for (const service of services) {
			const row = serviceById.get(service.serviceId)!;
			await tx.update(eventServices)
				.set({
					defaultSeatingDurationMinutes: service.defaultDurationMinutes,
					updatedAt: new Date(),
				})
				.where(eq(eventServices.id, service.serviceId));

			for (const seating of service.seatings) {
				const startTime = wallClockToInstant(row.date, seating.startMinutes, zone);
				const endTime = wallClockToInstant(row.date, seating.endMinutes, zone);
				const totalCapacity = seating.seating.capacityOverride ?? venue!;
				const fields = {
					titleEn: seating.seating.titleEn,
					titleFr: seating.seating.titleFr,
					descriptionEn: seating.seating.descriptionEn,
					descriptionFr: seating.seating.descriptionFr,
					startTime,
					endTime,
					totalCapacity,
					capacityOverridden: seating.seating.capacityOverride !== null,
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
						availableCapacity: totalCapacity,
					});
				} else {
					// Seats already held stay held; only the new total moves
					// the available count.
					await tx.update(eventSessions)
						.set({
							...fields,
							availableCapacity: totalCapacity - heldSeats(seating.seating.id),
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

/**
 * Set the Event's Venue Capacity alone (issue 021): every Seating that does
 * not override its capacity follows it, in one transaction, keeping the
 * seats it already holds. Refused with {@link SeatingCapacityRefusedError}
 * (French message naming the Seatings, nothing written) when an inheriting
 * Seating holds more seats than the new Venue Capacity.
 */
export async function saveVenueCapacity(eventId: string, venueCapacity: number): Promise<void> {
	await saveServiceSeatings(eventId, [], venueCapacity);
}

/**
 * The Event's Days → Services → Seatings as the admin Seatings editor
 * shows them (issue 020): Services ordered by Day then meal, Seatings by
 * start, with each Seating's Reservation count (any status — a booked
 * Seating cannot be removed). Services with no Seating yet are included so
 * the Admin can add the first one.
 */
export async function loadSeatingsEditor(eventId: string): Promise<EditorService[]> {
	const zone = await eventTimeZone(db, eventId);
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
					start: clockOf(seating.startTime, zone),
					end: clockOf(seating.endTime, zone),
					titleEn: seating.titleEn,
					titleFr: seating.titleFr,
					descriptionEn: seating.descriptionEn,
					descriptionFr: seating.descriptionFr,
					totalCapacity: seating.totalCapacity,
					availableCapacity: seating.availableCapacity,
					capacityOverridden: seating.capacityOverridden,
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
 * Service kind, ordered for grouping (day, then start time). Each Seating
 * carries the price it is booked at (its Service's, issue 022), or null
 * while its Service has no price yet.
 */
export async function getPublishedScheduleByEventId(
	eventId: string
): Promise<ScheduleRow<typeof eventSessions.$inferSelect & { titleEn: string; titleFr: string; price: SeatingPrice | null }>[]> {
	const rows: {
		dayDate: string;
		serviceKind: (typeof eventServices.$inferSelect)['kind'];
		servicePriceAmount: number | null;
		eventCurrency: string;
		timeZone: string;
		session: typeof eventSessions.$inferSelect;
	}[] = await db
		.select({
			dayDate: sql<string>`${eventDays.date}::text`,
			serviceKind: eventServices.kind,
			servicePriceAmount: eventServices.priceAmount,
			eventCurrency: events.currency,
			timeZone: events.timeZone,
			session: eventSessions,
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.innerJoin(events, eq(eventDays.eventId, events.id))
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
				timeZone: row.timeZone,
				dayDate: row.dayDate,
				serviceKind: row.serviceKind,
			}),
			price: resolveSeatingPrice({
				servicePriceAmount: row.servicePriceAmount,
				eventCurrency: row.eventCurrency,
				legacyPriceAmount: row.session.legacyPriceAmount,
				legacyCurrency: row.session.legacyCurrency,
			}),
		},
	}));
}

// ---------------------------------------------------------------------------
// Changing the Event's Time Zone (ADR 0006, issue 034)
// ---------------------------------------------------------------------------

/** French admin copy for a Time Zone that is not an IANA name. */
export const TIME_ZONE_ERROR_MESSAGE = 'Le fuseau horaire choisi est invalide.';

/** Refused: the Event already has Reservations, whose Tickets would shift. */
export class TimeZoneChangeRefusedError extends ScheduleSaveRefusedError {
	constructor() {
		super(
			'Impossible de changer le fuseau horaire : des séances ont déjà des réservations, leurs billets changeraient d’heure.'
		);
		this.name = 'TimeZoneChangeRefusedError';
	}
}

/**
 * Change an Event's Time Zone, keeping its Seatings' Days and wall-clock
 * times: every Seating's instants move to the same times on the new clock,
 * and the Event's start/end dates follow, in one transaction. Refused with
 * {@link TimeZoneChangeRefusedError} (nothing written) once any Seating of
 * the Event has a Reservation, whatever its status. A no-op when the zone
 * does not change.
 */
export async function changeEventTimeZone(eventId: string, timeZone: string): Promise<void> {
	if (!isValidTimeZone(timeZone)) {
		throw new Error(`Invalid time zone: ${timeZone}`);
	}

	await db.transaction(async (tx: typeof db) => {
		const [event] = await tx.select({ id: events.id, timeZone: events.timeZone, bookingOpensAt: events.bookingOpensAt })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1)
			.for('update');
		if (!event) {
			throw new Error('Event not found');
		}
		if (event.timeZone === timeZone) {
			return;
		}

		const seatings: { id: string; startTime: Date; endTime: Date }[] = await tx
			.select({ id: eventSessions.id, startTime: eventSessions.startTime, endTime: eventSessions.endTime })
			.from(eventSessions)
			.where(eq(eventSessions.eventId, eventId))
			.for('update');

		if (seatings.length > 0) {
			const [booked] = await tx.select({ id: reservations.id })
				.from(reservations)
				.where(inArray(reservations.eventSessionId, seatings.map((seating) => seating.id)))
				.limit(1);
			if (booked) {
				throw new TimeZoneChangeRefusedError();
			}
		}

		for (const seating of seatings) {
			const [startTime, endTime] = reconvertInstants(
				[seating.startTime, seating.endTime],
				event.timeZone,
				timeZone
			);
			await tx.update(eventSessions)
				.set({ startTime, endTime, updatedAt: new Date() })
				.where(eq(eventSessions.id, seating.id));
		}

		// The Booking Window's opening was typed on the Event's clock too
		// (035): it keeps its wall-clock time.
		const bookingOpensAt = event.bookingOpensAt
			? reconvertInstants([event.bookingOpensAt], event.timeZone, timeZone)[0]
			: null;

		await tx.update(events)
			.set({ timeZone, bookingOpensAt, updatedAt: new Date() })
			.where(eq(events.id, eventId));
		await recomputeEventDatesFromDays(tx, eventId);
	});
}

/** An Event's Time Zone, or null when there is no such Event. */
export async function getEventTimeZone(eventId: string): Promise<string | null> {
	const [row] = await db.select({ timeZone: events.timeZone }).from(events).where(eq(events.id, eventId)).limit(1);
	return row?.timeZone ?? null;
}

/**
 * Save an Event's Booking Window (issue 035), set in « Dates & séances »:
 * when bookings open and how many hours before each Seating they close.
 */
export async function saveBookingWindow(eventId: string, window: BookingWindow): Promise<void> {
	await db.update(events)
		.set({
			bookingOpensAt: window.opensAt,
			bookingClosesHoursBefore: window.closesHoursBefore,
			updatedAt: new Date(),
		})
		.where(eq(events.id, eventId));
}

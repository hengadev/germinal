/**
 * Pure time-of-day helpers for Seatings (issue 020).
 *
 * A Seating belongs to a Service, and a Service to one Day — so a Seating's
 * times are expressed as minutes since midnight on its Day, on the Event's
 * clock (its Time Zone, ADR 0006), and never
 * span two Days (the venue turns over between sittings; a meal that would
 * cross midnight is not a Seating of that Day).
 *
 * Shared by the admin Seatings editor (client-side pre-fill and overlap
 * flags) and the event-schedule service (server-side validation), so both
 * always agree on the arithmetic.
 */

import { serviceKindOfMinutes, type ServiceKind } from './event-time';

export type { ServiceKind };

export const MINUTES_PER_DAY = 24 * 60;

/**
 * Default Seating duration (minutes) given to a new Service, which has no
 * Seating yet to carry a duration over.
 */
export const DEFAULT_SERVICE_DURATION_MINUTES: Record<ServiceKind, number> = {
	lunch: 90,
	dinner: 180,
};

/** Parse an `HH:MM` time-of-day into minutes since midnight; null if invalid. */
export function parseTimeOfDay(value: string): number | null {
	const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

/** Format minutes since midnight as `HH:MM` (wraps within one Day). */
export function formatTimeOfDay(minutes: number): string {
	const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
	const hours = Math.floor(wrapped / 60);
	return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * End of a Seating started at `startMinutes` after `durationMinutes`; null
 * when it would reach or cross midnight — the Seating must end on its Day.
 */
export function endAfterDuration(startMinutes: number, durationMinutes: number): number | null {
	const end = startMinutes + durationMinutes;
	return end < MINUTES_PER_DAY ? end : null;
}

export interface SeatingOverlapHit {
	/** Index of the flagged Seating, in the order it was given. */
	index: number;
	/** End (minutes) of the earlier-starting Seating it collides with. */
	previousEndMinutes: number;
}

/**
 * Seatings of one Service that start before an earlier-starting Seating has
 * ended — the room would be double-booked. A Seating starting exactly when
 * the previous one ends (a perfect turn-over) is not an overlap.
 *
 * The collision is checked against the latest end of all earlier-starting
 * Seatings, so a short Seating squeezed inside a longer one flags the
 * sittings after it too.
 */
export function findSeatingOverlaps(
	seatings: { startMinutes: number; endMinutes: number }[]
): SeatingOverlapHit[] {
	const order = seatings
		.map((seating, index) => ({ ...seating, index }))
		.sort((a, b) => a.startMinutes - b.startMinutes);

	const hits: SeatingOverlapHit[] = [];
	let latestEnd: number | null = null;
	for (const seating of order) {
		if (latestEnd !== null && seating.startMinutes < latestEnd) {
			hits.push({ index: seating.index, previousEndMinutes: latestEnd });
		}
		latestEnd = Math.max(latestEnd ?? seating.endMinutes, seating.endMinutes);
	}
	return hits;
}

/** Why a Seating's times cannot be saved as typed. */
export type SeatingTimeError =
	/** Start is not a valid `HH:MM`. */
	| 'start'
	/** Explicit end is not a valid `HH:MM`, or is not after the start. */
	| 'end'
	/** The end filled from the default duration would reach midnight. */
	| 'midnight';

export interface SeatingReview {
	startMinutes: number | null;
	/** Explicit end, or the one filled from the default duration. */
	endMinutes: number | null;
	timeError: SeatingTimeError | null;
	/** The start falls on the other meal's side of the 16:00 cut-off. */
	mealMismatch: boolean;
	/** End (minutes) of the earlier Seating this one starts before, if any. */
	overlapsPreviousEndingAt: number | null;
}

/**
 * Review one Service's Seatings as typed in the admin editor, before saving
 * (issue 020): fill missing ends from the default duration, flag invalid
 * times, starts on the wrong side of the lunch/dinner cut-off, and Seatings
 * starting before the previous one ends. The server parses and checks the
 * same rules (`parseSeatingsPayload`, `saveServiceSeatings`), sharing
 * {@link endAfterDuration} and {@link findSeatingOverlaps}.
 */
export function reviewServiceSeatings(
	kind: ServiceKind,
	defaultDurationMinutes: number,
	seatings: { start: string; end: string | null }[]
): SeatingReview[] {
	const reviews: SeatingReview[] = seatings.map(({ start, end }) => {
		const startMinutes = parseTimeOfDay(start);
		if (startMinutes === null) {
			return { startMinutes, endMinutes: null, timeError: 'start', mealMismatch: false, overlapsPreviousEndingAt: null };
		}
		const mealMismatch = serviceKindOfMinutes(startMinutes) !== kind;
		if (end === null || end.trim() === '') {
			const filled = Number.isInteger(defaultDurationMinutes) && defaultDurationMinutes > 0
				? endAfterDuration(startMinutes, defaultDurationMinutes)
				: null;
			return {
				startMinutes,
				endMinutes: filled,
				timeError: filled === null ? 'midnight' : null,
				mealMismatch,
				overlapsPreviousEndingAt: null,
			};
		}
		const endMinutes = parseTimeOfDay(end);
		if (endMinutes === null || endMinutes <= startMinutes) {
			return { startMinutes, endMinutes: null, timeError: 'end', mealMismatch, overlapsPreviousEndingAt: null };
		}
		return { startMinutes, endMinutes, timeError: null, mealMismatch, overlapsPreviousEndingAt: null };
	});

	// Overlaps only make sense between Seatings whose times are both valid.
	const timed = reviews
		.map((review, index) => ({ review, index }))
		.filter(({ review }) => review.startMinutes !== null && review.endMinutes !== null);
	const hits = findSeatingOverlaps(
		timed.map(({ review }) => ({ startMinutes: review.startMinutes!, endMinutes: review.endMinutes! }))
	);
	for (const hit of hits) {
		reviews[timed[hit.index].index].overlapsPreviousEndingAt = hit.previousEndMinutes;
	}
	return reviews;
}

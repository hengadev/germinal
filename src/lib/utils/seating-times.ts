/**
 * Pure time-of-day helpers for Seatings (issue 020).
 *
 * A Seating belongs to a Service, and a Service to one Day — so a Seating's
 * times are expressed as minutes since UTC midnight on its Day and never
 * span two Days (the venue turns over between sittings; a meal that would
 * cross midnight is not a Seating of that Day).
 *
 * Shared by the admin Seatings editor (client-side pre-fill and overlap
 * flags) and the event-schedule service (server-side validation), so both
 * always agree on the arithmetic.
 */

export const MINUTES_PER_DAY = 24 * 60;

/**
 * Hour (UTC) at which a Seating stops counting as lunch: a start time
 * before 16:00 is lunch, 16:00 and later is dinner. Cut-off confirmed
 * in issue 018.
 */
export const LUNCH_DINNER_CUTOFF_HOUR = 16;

export type ServiceKind = 'lunch' | 'dinner';

/** Meal a time of day (minutes since UTC midnight) belongs to. */
export function serviceKindOfMinutes(minutes: number): ServiceKind {
	return minutes < LUNCH_DINNER_CUTOFF_HOUR * 60 ? 'lunch' : 'dinner';
}

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

import { endAfterDuration, parseTimeOfDay } from './seating-times';
import { serviceKindOfMinutes, type ServiceKind } from './event-time';

/**
 * Seating template for one meal kind (Séances editor): the start times and
 * default duration the admin types once, then applies to every lunch or
 * every dinner of the Event. Applying only adds Seatings — it never
 * removes or changes one, so a booked Seating is never touched.
 */

export type SeatingTemplateError =
	| { reason: 'empty' }
	| { reason: 'duration' }
	| { reason: 'start'; index: number }
	| { reason: 'meal'; index: number }
	| { reason: 'midnight'; index: number };

export type SeatingTemplateReview =
	| { ok: true; startMinutes: number[] }
	| { ok: false; error: SeatingTemplateError };

/**
 * Check a template: at least one start, a duration of 1 to 1440 minutes,
 * every start a valid `HH:MM` within the meal's window (lunch before the
 * 16:00 cut-off on the Event's clock, dinner from it) and ending before midnight. Returns
 * the starts in minutes, sorted, without duplicates.
 */
export function reviewSeatingTemplate(
	kind: ServiceKind,
	starts: string[],
	duration: number | null
): SeatingTemplateReview {
	if (starts.length === 0) return { ok: false, error: { reason: 'empty' } };
	if (duration === null || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
		return { ok: false, error: { reason: 'duration' } };
	}
	const minutes = new Set<number>();
	for (const [index, start] of starts.entries()) {
		const value = parseTimeOfDay(start);
		if (value === null) return { ok: false, error: { reason: 'start', index } };
		if (serviceKindOfMinutes(value) !== kind) return { ok: false, error: { reason: 'meal', index } };
		if (endAfterDuration(value, duration) === null) return { ok: false, error: { reason: 'midnight', index } };
		minutes.add(value);
	}
	return { ok: true, startMinutes: [...minutes].sort((a, b) => a - b) };
}

/** The template starts a Service does not have yet, given its Seatings' starts. */
export function startsToAdd(existingStarts: string[], templateStarts: number[]): number[] {
	const existing = new Set(
		existingStarts.map(parseTimeOfDay).filter((value): value is number => value !== null)
	);
	return templateStarts.filter((start) => !existing.has(start));
}

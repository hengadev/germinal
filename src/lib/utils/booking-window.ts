/**
 * Booking Window (issue 035, CONTEXT.md) — pure, no database.
 *
 * The period during which a Seating can be booked. Set once per Event: it
 * opens at a chosen instant (by default, as soon as the Event is
 * published — Event access already refuses an unpublished one) and closes
 * a chosen number of hours before each Seating starts (by default, at its
 * start). Event access asks it whether a Seating can be booked or
 * wait-listed now.
 */

/** An Event's Booking Window settings; both optional. */
export interface BookingWindow {
	/** When bookings open; null: as soon as the Event is published. */
	opensAt: Date | null;
	/** How many hours before each Seating's start its bookings close;
	 * null (or 0): at its start. */
	closesHoursBefore: number | null;
}

/** No settings: open as soon as published, close at each Seating's start. */
export const DEFAULT_BOOKING_WINDOW: BookingWindow = { opensAt: null, closesHoursBefore: null };

export type BookingWindowState =
	| { state: 'not-open'; opensAt: Date }
	| { state: 'open' }
	| { state: 'closed'; closedAt: Date };

const HOUR_MS = 60 * 60 * 1000;

/** The instant a Seating starting at `seatingStart` stops taking bookings. */
export function bookingClosesAt(window: BookingWindow, seatingStart: Date): Date {
	return new Date(seatingStart.getTime() - (window.closesHoursBefore ?? 0) * HOUR_MS);
}

/**
 * Where `now` falls in the Booking Window of a Seating starting at
 * `seatingStart`: before its opening (open from `opensAt` inclusive), open,
 * or closed (from the closing instant inclusive). When a window would
 * close before it opens, closed wins once the closing instant is past.
 */
export function bookingWindowState(window: BookingWindow, seatingStart: Date, now: Date): BookingWindowState {
	const closedAt = bookingClosesAt(window, seatingStart);
	if (now.getTime() >= closedAt.getTime()) return { state: 'closed', closedAt };
	if (window.opensAt && now.getTime() < window.opensAt.getTime()) {
		return { state: 'not-open', opensAt: window.opensAt };
	}
	return { state: 'open' };
}

/** The most closing hours an Admin may set (a year). */
export const MAX_CLOSING_HOURS = 24 * 365;

export type BookingWindowParseResult =
	| { ok: true; window: BookingWindow }
	| { ok: false; reason: 'invalid-opening' | 'invalid-closing-hours' };

/**
 * Parse the Booking Window posted by the « Dates & séances » form. The
 * opening date-time is typed as wall-clock time (`YYYY-MM-DDTHH:MM`) and
 * turned into an instant by `toInstant` (the Event's Time Zone); the
 * closing hours are a whole number of hours. Blank means "not set".
 */
export function parseBookingWindow(
	rawOpensAt: string | null,
	rawClosesHoursBefore: string | null,
	toInstant: (day: string, minutes: number) => Date
): BookingWindowParseResult {
	let opensAt: Date | null = null;
	const opening = rawOpensAt?.trim() ?? '';
	if (opening !== '') {
		const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(opening);
		if (!match) return { ok: false, reason: 'invalid-opening' };
		const [, day, hours, minutes] = match;
		const [year, month, date] = day.split('-').map(Number);
		const check = new Date(Date.UTC(year, month - 1, date));
		if (
			check.getUTCFullYear() !== year ||
			check.getUTCMonth() !== month - 1 ||
			check.getUTCDate() !== date ||
			Number(hours) > 23 ||
			Number(minutes) > 59
		) {
			return { ok: false, reason: 'invalid-opening' };
		}
		opensAt = toInstant(day, Number(hours) * 60 + Number(minutes));
	}

	let closesHoursBefore: number | null = null;
	const closing = rawClosesHoursBefore?.trim() ?? '';
	if (closing !== '') {
		if (!/^\d+$/.test(closing)) return { ok: false, reason: 'invalid-closing-hours' };
		const value = Number(closing);
		if (value > MAX_CLOSING_HOURS) return { ok: false, reason: 'invalid-closing-hours' };
		closesHoursBefore = value;
	}

	return { ok: true, window: { opensAt, closesHoursBefore } };
}

/** French admin copy for an invalid Booking Window. */
export const BOOKING_WINDOW_ERROR_MESSAGES: Record<'invalid-opening' | 'invalid-closing-hours', string> = {
	'invalid-opening': 'La date d’ouverture des réservations est invalide.',
	'invalid-closing-hours': `La clôture des réservations doit être un nombre entier d’heures, entre 0 et ${MAX_CLOSING_HOURS}.`,
};

/** The form field each failure names (issue 017): the message shows under it. */
export const BOOKING_WINDOW_ERROR_FIELDS: Record<'invalid-opening' | 'invalid-closing-hours', string> = {
	'invalid-opening': 'bookingOpensAt',
	'invalid-closing-hours': 'bookingClosesHoursBefore',
};

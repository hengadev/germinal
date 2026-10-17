/**
 * Event time — Seatings in the Event's Time Zone (ADR 0006, issue 034).
 *
 * Seatings are stored as UTC instants; the Admin types wall-clock times in
 * the Event's IANA Time Zone and every display formats them in that zone,
 * never the server's or the visitor's. A Seating's Day and whether it is
 * lunch or dinner are read on the Event's clock too.
 *
 * Pure, built on `Intl` only (no dependency), shared by server code and
 * Svelte components. DST is handled the way Temporal's "compatible"
 * disambiguation does: a wall-clock time in a spring-forward gap moves
 * forward by the gap, an ambiguous fall-back time takes the earlier instant.
 */

export const DEFAULT_EVENT_TIME_ZONE = 'Europe/Paris';

export type ServiceKind = 'lunch' | 'dinner';

/**
 * Hour, on the Event's clock, at which a Seating stops counting as lunch:
 * a start before 16:00 is lunch, 16:00 and later is dinner (issue 018).
 */
export const LUNCH_DINNER_CUTOFF_HOUR = 16;

export type EventTimeLocale = 'en' | 'fr';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
	let formatter = partsFormatters.get(zone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		partsFormatters.set(zone, formatter);
	}
	return formatter;
}

interface WallClock {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

function wallClockOf(instant: Date, zone: string): WallClock {
	const values: Record<string, number> = {};
	for (const part of partsFormatter(zone).formatToParts(instant)) {
		if (part.type !== 'literal') values[part.type] = Number(part.value);
	}
	return {
		year: values.year,
		month: values.month,
		day: values.day,
		// Some engines still print midnight as 24 with h23.
		hour: values.hour === 24 ? 0 : values.hour,
		minute: values.minute,
		second: values.second,
	};
}

/** Offset (ms) of `zone` from UTC at `epochMs`: local clock minus UTC. */
function offsetAt(epochMs: number, zone: string): number {
	const wall = wallClockOf(new Date(epochMs), zone);
	const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
	const truncated = epochMs - (((epochMs % 1000) + 1000) % 1000);
	return asUtc - truncated;
}

function toInstant(value: Date | string): Date {
	return typeof value === 'string' ? new Date(value) : value;
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

/** Is `zone` an IANA Time Zone name this runtime knows? */
export function isValidTimeZone(zone: string): boolean {
	if (typeof zone !== 'string' || zone.trim() === '') return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** IANA Time Zones the Admin can pick from, sorted, always with the default. */
export function listTimeZones(): string[] {
	const supported =
		typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
	const zones = new Set<string>(supported);
	zones.add(DEFAULT_EVENT_TIME_ZONE);
	return [...zones].filter(isValidTimeZone).sort();
}

/**
 * The instant of `minutes` since midnight on `day` (`YYYY-MM-DD`) on the
 * clock of `zone`.
 */
export function wallClockToInstant(day: string, minutes: number, zone: string): Date {
	const [year, month, date] = day.split('-').map(Number);
	const wallAsUtc = Date.UTC(year, month - 1, date) + minutes * MINUTE_MS;
	const before = offsetAt(wallAsUtc - DAY_MS, zone);
	const after = offsetAt(wallAsUtc + DAY_MS, zone);
	const candidates = [...new Set([wallAsUtc - before, wallAsUtc - after])]
		.filter((epoch) => epoch + offsetAt(epoch, zone) === wallAsUtc)
		.sort((a, b) => a - b);
	// Ambiguous (fall back): the earlier instant. In a gap (spring forward)
	// no candidate matches: read it with the pre-transition offset, which
	// lands just after the gap.
	return new Date(candidates[0] ?? wallAsUtc - before);
}

/** The Day (`YYYY-MM-DD`) an instant falls on in `zone`. */
export function dayOf(instant: Date | string, zone: string): string {
	const wall = wallClockOf(toInstant(instant), zone);
	return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** Minutes since midnight of an instant on the clock of `zone`. */
export function minutesOf(instant: Date | string, zone: string): number {
	const wall = wallClockOf(toInstant(instant), zone);
	return wall.hour * 60 + wall.minute;
}

/** `HH:MM` of an instant on the clock of `zone`. */
export function clockOf(instant: Date | string, zone: string): string {
	const minutes = minutesOf(instant, zone);
	return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Meal a wall-clock time of day (minutes since local midnight) belongs to. */
export function serviceKindOfMinutes(minutes: number): ServiceKind {
	return minutes < LUNCH_DINNER_CUTOFF_HOUR * 60 ? 'lunch' : 'dinner';
}

/** Meal an instant belongs to, read on the clock of `zone`. */
export function serviceKindOf(instant: Date | string, zone: string): ServiceKind {
	return serviceKindOfMinutes(minutesOf(instant, zone));
}

function nextDay(day: string): string {
	const [year, month, date] = day.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/** First instant of `day` in `zone` (local midnight). */
export function dayStart(day: string, zone: string): Date {
	return wallClockToInstant(day, 0, zone);
}

/** Last representable instant (ms) of `day` in `zone`. */
export function dayEnd(day: string, zone: string): Date {
	return new Date(dayStart(nextDay(day), zone).getTime() - 1);
}

function intlLocale(locale: EventTimeLocale): string {
	return locale === 'fr' ? 'fr-FR' : 'en-GB';
}

/** A Seating's start or end time, `HH:MM`, on the Event's clock (no zone label). */
export function formatSeatingTime(instant: Date | string, zone: string, locale: EventTimeLocale): string {
	return new Intl.DateTimeFormat(intlLocale(locale), {
		timeZone: zone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).format(toInstant(instant));
}

/** A Seating's Day, e.g. `jeudi 16 juillet 2026`, on the Event's clock. */
export function formatSeatingDate(
	instant: Date | string,
	zone: string,
	locale: EventTimeLocale,
	options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
): string {
	return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: zone }).format(toInstant(instant));
}

/**
 * A Day key (`YYYY-MM-DD`) as a calendar date, e.g. `jeudi 16 juillet 2026`.
 * A Day is a calendar date with no instant, so no zone applies.
 */
export function formatDayKey(
	day: string,
	locale: EventTimeLocale,
	options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
): string {
	return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: 'UTC' }).format(
		new Date(`${day}T12:00:00Z`)
	);
}

/**
 * Re-convert instants typed on the clock of `fromZone` to `toZone`, keeping
 * each one's Day and wall-clock time (an Event's Time Zone change).
 */
export function reconvertInstants(instants: Date[], fromZone: string, toZone: string): Date[] {
	return instants.map((instant) => {
		const wall = wallClockOf(instant, fromZone);
		const seconds = wall.second * 1000 + (((instant.getTime() % 1000) + 1000) % 1000);
		const moved = wallClockToInstant(dayOf(instant, fromZone), wall.hour * 60 + wall.minute, toZone);
		return new Date(moved.getTime() + seconds);
	});
}

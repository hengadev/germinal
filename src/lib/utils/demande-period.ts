/**
 * Demandes received-period filter (issue 074).
 *
 * The Admin picks a preset (« Aujourd'hui », last 7 / 30 days) or a custom
 * from/to; days are Paris days, whatever the server's zone. Pure, built on
 * `Intl` only, usable server-side and in components.
 */

import { DEFAULT_EVENT_TIME_ZONE, wallClockToInstant } from './event-time';

export type DemandePeriodPreset = 'today' | '7d' | '30d' | 'custom';

export type DemandePeriod = { from: Date | null; to: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Paris calendar day of an instant, as 'YYYY-MM-DD'. */
export function parisDay(instant: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: DEFAULT_EVENT_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(instant);
}

/** UTC instant at which the given Paris calendar day starts (00:00 Paris). */
function parisDayStart(day: string): Date {
	return wallClockToInstant(day, 0, DEFAULT_EVENT_TIME_ZONE);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns a preset (or a custom 'YYYY-MM-DD' from/to) into a UTC date range
 * covering whole Paris days. `to` is inclusive (exclusive upper bound).
 * Invalid or missing values yield null bounds; callers then simply don't
 * filter on that bound.
 */
export function resolveDemandePeriod(
	preset: string | null | undefined,
	now: Date,
	from?: string | null,
	to?: string | null
): DemandePeriod {
	switch (preset) {
		case 'today': {
			const start = parisDayStart(parisDay(now));
			return { from: start, to: new Date(start.getTime() + DAY_MS) };
		}
		case '7d':
		case '30d': {
			const today = parisDayStart(parisDay(now));
			const days = preset === '7d' ? 7 : 30;
			return {
				from: new Date(today.getTime() - (days - 1) * DAY_MS),
				to: new Date(today.getTime() + DAY_MS)
			};
		}
		case 'custom': {
			const fromDay = from && ISO_DATE.test(from) ? from : null;
			const toDay = to && ISO_DATE.test(to) ? to : null;
			return {
				from: fromDay ? parisDayStart(fromDay) : null,
				to: toDay ? new Date(parisDayStart(toDay).getTime() + DAY_MS) : null
			};
		}
		default:
			return { from: null, to: null };
	}
}

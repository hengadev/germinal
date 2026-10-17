import { formatDayKey, type EventTimeLocale } from './event-time';

/**
 * The dates line of a Portfolio project page (issue 045) — pure.
 *
 * An Event's Days are calendar dates at the venue and need not be
 * consecutive (ADR 0005). The project page names them in one line:
 * consecutive Days collapse into a range, and the month and year are said
 * once when they are shared — « 12–14 mars 2027 », « 12, 19 et 26 mars
 * 2027 », « 30 mars – 2 avril 2027 ».
 */

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function nextDay(day: string): string {
	const date = new Date(`${day}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

/** Consecutive runs of sorted, distinct Days. */
function runsOf(days: string[]): [string, string][] {
	const runs: [string, string][] = [];
	for (const day of days) {
		const last = runs[runs.length - 1];
		if (last && nextDay(last[1]) === day) last[1] = day;
		else runs.push([day, day]);
	}
	return runs;
}

const listFormat = (locale: EventTimeLocale) =>
	new Intl.ListFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { style: 'long', type: 'conjunction' });

/**
 * The Days of an Event as one line in `locale`, or an empty string when it
 * has none. Malformed entries are ignored.
 */
export function formatProjectDates(days: readonly string[], locale: EventTimeLocale): string {
	const sorted = [...new Set(days.filter((day) => DAY_KEY.test(day)))].sort();
	if (sorted.length === 0) return '';

	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	const sameYear = first.slice(0, 4) === last.slice(0, 4);
	const sameMonth = sameYear && first.slice(5, 7) === last.slice(5, 7);

	// What each Day is written with, the shared part being said once at the end.
	const options: Intl.DateTimeFormatOptions = sameMonth
		? { day: 'numeric' }
		: sameYear
			? { day: 'numeric', month: 'long' }
			: { day: 'numeric', month: 'long', year: 'numeric' };
	const label = (day: string) => formatDayKey(day, locale, options);
	const dash = sameMonth ? '–' : ' – ';

	const parts = runsOf(sorted).map(([start, end]) =>
		start === end ? label(start) : `${label(start)}${dash}${label(end)}`
	);
	const joined = listFormat(locale).format(parts);

	if (sameMonth) return `${joined} ${formatDayKey(first, locale, { month: 'long', year: 'numeric' })}`;
	if (sameYear) return `${joined} ${first.slice(0, 4)}`;
	return joined;
}

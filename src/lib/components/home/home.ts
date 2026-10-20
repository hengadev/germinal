// What the home page says about an Event and a Talent: its dates, place
// and year, a Talent's name, craft and words.
import { dayOf, formatSeatingDate } from '$lib/utils/event-time';
import { localizedText } from '$lib/utils/event-text';
import type { EventWithMedia } from '$lib/types/events';
import type { TalentWithMedia } from '$lib/types/talents';

type Lang = 'fr' | 'en';
const langOf = (locale: string | null | undefined): Lang => (locale === 'en' ? 'en' : 'fr');

export function titleOf(event: EventWithMedia, locale: string | null | undefined): string {
	return localizedText(event.titleEn, event.titleFr, locale);
}

export function subtitleOf(event: EventWithMedia, locale: string | null | undefined): string {
	return localizedText(event.subtitleEn, event.subtitleFr, locale);
}

/** « 26 – 27 novembre 2026 », or one day when the Event holds one. */
export function datesOf(event: EventWithMedia, locale: string | null | undefined): string {
	if (!event.startDate) return '';
	const lang = langOf(locale);
	const start = new Date(event.startDate);
	const end = event.endDate ? new Date(event.endDate) : start;
	const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
	if (dayOf(start, event.timeZone) === dayOf(end, event.timeZone)) return formatSeatingDate(start, event.timeZone, lang, full);
	const sameMonth = formatSeatingDate(start, event.timeZone, lang, { month: 'numeric', year: 'numeric' }) === formatSeatingDate(end, event.timeZone, lang, { month: 'numeric', year: 'numeric' });
	const from = formatSeatingDate(start, event.timeZone, lang, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' });
	return `${from} – ${formatSeatingDate(end, event.timeZone, lang, full)}`;
}

/** The venue, then its district or its city. */
export function placeOf(event: EventWithMedia, locale: string | null | undefined): string {
	const venue = localizedText(event.venueNameEn, event.venueNameFr, locale);
	const area = localizedText(event.districtEn, event.districtFr, locale) || localizedText(event.cityEn, event.cityFr, locale);
	return [venue, area].filter(Boolean).join(', ');
}

export function yearOf(event: EventWithMedia): string {
	return event.startDate ? String(new Date(event.startDate).getUTCFullYear()) : '';
}

/** A Talent's full name. */
export function nameOf(talent: TalentWithMedia): string {
	return `${talent.firstName} ${talent.lastName}`;
}

export function roleOf(talent: TalentWithMedia, locale: string | null | undefined): string {
	return localizedText(talent.roleEn, talent.roleFr, locale);
}

export function quoteOf(talent: TalentWithMedia, locale: string | null | undefined): string {
	return localizedText(talent.quoteEn, talent.quoteFr, locale);
}

/** A Talent's words in the language's quotation marks. */
export function quoted(text: string, locale: string | null | undefined): string {
	return langOf(locale) === 'en' ? `“${text}”` : `« ${text} »`;
}

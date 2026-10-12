/**
 * Display titles for Seatings (issue 020).
 *
 * Seating titles are optional: an Admin adds Seatings to a Service as start
 * times, and every place that shows a Seating — public pages, the Ticket,
 * emails, Stripe Checkout line items, admin and staff lists — falls back to
 * a label derived from the Seating's Day, Service (meal) and start time.
 *
 * Pure and dependency-free so both server code and Svelte components use the
 * one derivation. UTC throughout: Day keys and the lunch/dinner cut-off are
 * evaluated on the UTC clock, like the rest of the schedule (ADR 0005).
 */

import { LUNCH_DINNER_CUTOFF_HOUR, type ServiceKind } from './seating-times';

export type SeatingLocale = 'en' | 'fr';

export interface SeatingLabelContext {
	/** Day key (`YYYY-MM-DD`) when known; derived from the start time if not. */
	dayDate?: string;
	/** Service kind when known; derived from the start time if not. */
	serviceKind?: ServiceKind;
}

/** Anything carrying a Seating's (optional) titles and its start time. */
export interface TitledSeating {
	titleEn?: string | null;
	titleFr?: string | null;
	startTime: Date | string;
}

function clean(title: string | null | undefined): string | null {
	const trimmed = title?.trim();
	return trimmed ? trimmed : null;
}

/**
 * The label shown for a Seating with no stored title: its Service (meal),
 * its Day and its start time, e.g. `Dîner — mercredi 10 juin 2099, 19h00`.
 */
export function derivedSeatingTitle(
	startTime: Date | string,
	context: SeatingLabelContext = {},
	locale: SeatingLocale = 'fr'
): string {
	const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
	const kind: ServiceKind =
		context.serviceKind ?? (start.getUTCHours() < LUNCH_DINNER_CUTOFF_HOUR ? 'lunch' : 'dinner');
	const day = context.dayDate ?? start.toISOString().slice(0, 10);

	const meal =
		locale === 'fr'
			? kind === 'lunch' ? 'Déjeuner' : 'Dîner'
			: kind === 'lunch' ? 'Lunch' : 'Dinner';
	const date = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(`${day}T12:00:00Z`));
	const hours = String(start.getUTCHours()).padStart(2, '0');
	const minutes = String(start.getUTCMinutes()).padStart(2, '0');
	const clock = locale === 'fr' ? `${hours}h${minutes}` : `${hours}:${minutes}`;
	return `${meal} — ${date}, ${clock}`;
}

/**
 * One locale's display title: the stored title when non-blank, otherwise the
 * derived label. Never empty — safe for Stripe line-item names and emails.
 */
export function seatingTitle(
	seating: TitledSeating,
	locale: SeatingLocale,
	context: SeatingLabelContext = {}
): string {
	const stored = clean(locale === 'en' ? seating.titleEn : seating.titleFr);
	return stored ?? derivedSeatingTitle(seating.startTime, context, locale);
}

/**
 * Both display titles (stored or derived). Used at read boundaries so
 * untitled Seatings never render blank.
 */
export function seatingTitlesWithFallback(
	seating: TitledSeating,
	context: SeatingLabelContext = {}
): { titleEn: string; titleFr: string } {
	return {
		titleEn: seatingTitle(seating, 'en', context),
		titleFr: seatingTitle(seating, 'fr', context),
	};
}

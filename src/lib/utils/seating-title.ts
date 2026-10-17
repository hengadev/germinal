/**
 * Display titles for Seatings (issue 020).
 *
 * Seating titles are optional: an Admin adds Seatings to a Service as start
 * times, and every place that shows a Seating — public pages, the Ticket,
 * emails, Stripe Checkout line items, admin and staff lists — falls back to
 * a label derived from the Seating's Day, Service (meal) and start time.
 *
 * Pure and dependency-free so both server code and Svelte components use the
 * one derivation. The Day, the meal and the start time are read in the
 * Event's Time Zone (ADR 0006), never the server's or the visitor's.
 */

import {
	clockOf,
	dayOf,
	formatDayKey,
	serviceKindOf,
	type ServiceKind,
} from './event-time';

export type SeatingLocale = 'en' | 'fr';

export interface SeatingLabelContext {
	/** The Event's IANA Time Zone: the clock the label is read on. */
	timeZone: string;
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
	context: SeatingLabelContext,
	locale: SeatingLocale = 'fr'
): string {
	const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
	const zone = context.timeZone;
	const kind: ServiceKind = context.serviceKind ?? serviceKindOf(start, zone);
	const day = context.dayDate ?? dayOf(start, zone);

	const meal =
		locale === 'fr'
			? kind === 'lunch' ? 'Déjeuner' : 'Dîner'
			: kind === 'lunch' ? 'Lunch' : 'Dinner';
	const date = formatDayKey(day, locale);
	const time = clockOf(start, zone);
	const clock = locale === 'fr' ? time.replace(':', 'h') : time;
	return `${meal} — ${date}, ${clock}`;
}

/**
 * One locale's display title: the stored title when non-blank, otherwise the
 * derived label. Never empty — safe for Stripe line-item names and emails.
 */
export function seatingTitle(
	seating: TitledSeating,
	locale: SeatingLocale,
	context: SeatingLabelContext
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
	context: SeatingLabelContext
): { titleEn: string; titleFr: string } {
	return {
		titleEn: seatingTitle(seating, 'en', context),
		titleFr: seatingTitle(seating, 'fr', context),
	};
}

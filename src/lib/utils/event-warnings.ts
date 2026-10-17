import {
	bookingClosesAt,
	DEFAULT_BOOKING_WINDOW,
	type BookingWindow,
} from './booking-window';
import {
	DEFAULT_EVENT_TIME_ZONE,
	formatDayKey,
	formatSeatingDateTime,
	wallClockToInstant,
} from './event-time';
import type { ServiceKind } from './event-time';
import type { EditorService } from '$lib/types/seatings-editor';
import type { PricingEditorData } from '$lib/types/pricing-editor';

/**
 * Event warnings (issue 038, ADR 0008) — pure, no database.
 *
 * Given a snapshot of an Event, returns what is missing for publishing:
 * each item carries a code, a French message and the editor tab that
 * fixes it. Publishing is never refused (ADR 0008) — the list warns and
 * the Admin decides; it stays visible while the Event is published.
 *
 * Inputs are plain snapshots so later issues slot items in by widening
 * them (alt text, the Portfolio's second list).
 */

/** The editor tab an item is fixed in (EventEditor's tab ids). */
export type EditorTabId = 'essentiel' | 'lieu' | 'dates-seances' | 'tarifs' | 'programme' | 'visuels';

/** One thing to check before publishing. */
export interface EventWarning {
	code: EventWarningCode;
	/** French admin copy, naming the Service or Seating concerned. */
	message: string;
	/** The editor tab where the item is fixed. */
	tab: EditorTabId;
}

export type EventWarningCode =
	| 'no-seating'
	| 'service-without-price'
	| 'service-without-menu'
	| 'missing-title-en'
	| 'missing-title-fr'
	| 'missing-description-en'
	| 'missing-description-fr'
	| 'missing-location-en'
	| 'missing-location-fr'
	| 'no-visual'
	| 'booking-window-opens-after-close';

/** A Service as the warnings read it: a Day's meal with its Menu and price. */
export interface WarningService {
	serviceId: string;
	/** `YYYY-MM-DD`. */
	date: string;
	kind: ServiceKind;
	menuId: string | null;
	/** Minor units; null while the price is not set (Seatings unbookable). */
	priceAmount: number | null;
}

/** A Seating as the warnings read it: only when it starts. */
export interface WarningSeating {
	startTime: Date;
}

/**
 * What the warnings need to know about an Event. Every field may be absent
 * (or null): an absent one reads as missing, so a caller that knows less
 * warns more, never less.
 */
export interface EventWarningsInput {
	titleEn?: string | null;
	titleFr?: string | null;
	descriptionEn?: string | null;
	descriptionFr?: string | null;
	locationEn?: string | null;
	locationFr?: string | null;
	/** The Event's Services; absent: none known. */
	services?: readonly WarningService[];
	/** The Event's Seatings; absent: none known. */
	seatings?: readonly WarningSeating[];
	/** How many Visuals (cover and gallery) the Event has. */
	visualCount?: number;
	/** The Event's Booking Window; absent: the default one. */
	bookingWindow?: BookingWindow;
	/** The Event's Time Zone, to place the Booking Window's instants in
	 * the messages; absent: the default one. */
	timeZone?: string;
}

function present(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim() !== '';
}

function kindLabel(kind: ServiceKind): string {
	return kind === 'lunch' ? 'déjeuner' : 'dîner';
}

/** `le déjeuner du jeudi 16 juillet 2026` — how a Service is named. */
function serviceLabel(service: WarningService): string {
	return `${kindLabel(service.kind)} du ${formatDayKey(service.date, 'fr')}`;
}

/**
 * What is missing for publishing, in the order the editor lists it: the
 * schedule first (a Seating, prices, Menus), then the texts per language,
 * the Visuals and the Booking Window.
 */
export function eventWarnings(input: EventWarningsInput): EventWarning[] {
	const warnings: EventWarning[] = [];
	const services = input.services ?? [];
	const seatings = input.seatings ?? [];
	const zone = input.timeZone ?? DEFAULT_EVENT_TIME_ZONE;
	const window = input.bookingWindow ?? DEFAULT_BOOKING_WINDOW;

	if (seatings.length === 0) {
		warnings.push({
			code: 'no-seating',
			message: 'Aucune séance : l’événement est annoncé, mais personne ne peut réserver.',
			tab: 'dates-seances',
		});
	}

	for (const service of services) {
		if (service.priceAmount === null) {
			warnings.push({
				code: 'service-without-price',
				message: `${serviceLabel(service)} n’a pas de prix : ses séances ne peuvent pas être réservées.`,
				tab: 'tarifs',
			});
		}
		if (service.menuId === null) {
			warnings.push({
				code: 'service-without-menu',
				message: `${serviceLabel(service)} n’a pas de menu.`,
				tab: 'tarifs',
			});
		}
	}

	const texts: [EventWarningCode, string, boolean][] = [
		['missing-title-en', 'Titre manquant en anglais.', present(input.titleEn)],
		['missing-title-fr', 'Titre manquant en français.', present(input.titleFr)],
		['missing-description-en', 'Description manquante en anglais.', present(input.descriptionEn)],
		['missing-description-fr', 'Description manquante en français.', present(input.descriptionFr)],
		['missing-location-en', 'Lieu manquant en anglais.', present(input.locationEn)],
		['missing-location-fr', 'Lieu manquant en français.', present(input.locationFr)],
	];
	for (const [code, message, isPresent] of texts) {
		if (!isPresent) {
			warnings.push({
				code,
				message,
				tab: code.startsWith('missing-location') ? 'lieu' : 'essentiel',
			});
		}
	}

	if ((input.visualCount ?? 0) === 0) {
		warnings.push({
			code: 'no-visual',
			message: 'Aucun visuel : l’événement s’affiche sans image.',
			tab: 'visuels',
		});
	}

	// A Booking Window that opens after a Seating's bookings have closed
	// leaves that Seating forever unbookable (booking-window.ts's window is
	// empty for it).
	if (window.opensAt !== null) {
		const unreachable = seatings
			.filter((seating) => window.opensAt!.getTime() >= bookingClosesAt(window, seating.startTime).getTime())
			.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
		if (unreachable.length > 0) {
			const opens = formatSeatingDateTime(window.opensAt, zone, 'fr');
			const closed = unreachable
				.map((seating) => formatSeatingDateTime(bookingClosesAt(window, seating.startTime), zone, 'fr'))
				.join(', ');
			const one = unreachable.length === 1;
			warnings.push({
				code: 'booking-window-opens-after-close',
				message: `Les réservations s’ouvrent le ${opens}, après la clôture ${
					one ? 'de la séance du' : 'des séances du'
				} ${closed} : ${one ? 'elle ne pourra jamais être réservée' : 'elles ne pourront jamais être réservées'}.`,
				tab: 'dates-seances',
			});
		}
	}

	return warnings;
}

// ---------------------------------------------------------------------------
// Reading the editor's page data
// ---------------------------------------------------------------------------

/** What the editor's pages know about a saved Event (a subset of the
 * Event's columns, named structurally so the module stays pure). */
export interface EditorWarningsEvent {
	titleEn: string | null;
	titleFr: string | null;
	descriptionEn: string | null;
	descriptionFr: string | null;
	locationEn: string | null;
	locationFr: string | null;
	timeZone: string;
	bookingOpensAt: Date | string | null;
	bookingClosesHoursBefore: number | null;
	coverMediaId: string | null;
	coverMedia?: { id: string } | null;
	media?: { id: string }[] | null;
}

/**
 * The warnings for the Event the editor shows, read from its page data:
 * the Event's texts and Booking Window, its Seatings (« Dates & séances »,
 * typed on its clock) and each Service's Menu and price (« Menus &
 * tarifs »).
 */
export function editorEventWarnings(
	event: EditorWarningsEvent,
	schedule: EditorService[],
	pricing: PricingEditorData
): EventWarning[] {
	const zone = event.timeZone;
	const seatings: WarningSeating[] = schedule.flatMap((service) =>
		service.seatings.map((seating) => ({
			startTime: wallClockToInstant(service.date, toMinutes(seating.start), zone),
		}))
	);
	const services: WarningService[] = pricing.services.map((service) => ({
		serviceId: service.serviceId,
		date: service.date,
		kind: service.kind,
		menuId: service.menuId,
		priceAmount: service.priceAmount,
	}));
	const cover = event.coverMediaId ?? event.coverMedia?.id ?? null;
	const visualCount =
		(cover !== null ? 1 : 0) + (event.media ?? []).filter((medium) => medium.id !== cover).length;
	return eventWarnings({
		titleEn: event.titleEn,
		titleFr: event.titleFr,
		descriptionEn: event.descriptionEn,
		descriptionFr: event.descriptionFr,
		locationEn: event.locationEn,
		locationFr: event.locationFr,
		services,
		seatings,
		visualCount,
		bookingWindow: {
			opensAt: event.bookingOpensAt ? new Date(event.bookingOpensAt) : null,
			closesHoursBefore: event.bookingClosesHoursBefore ?? null,
		},
		timeZone: zone,
	});
}

/** Minutes since midnight of an `HH:MM` editor time (0 when malformed). */
function toMinutes(clock: string): number {
	const [hours, minutes] = clock.split(':').map(Number);
	return (hours || 0) * 60 + (minutes || 0);
}

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
import { lacksAltText, type MediaAltText } from './media-alt';
import { eventPhotosOf, visualsOf, type RoledMedia } from './event-photos';

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
export type EditorTabId =
	| 'essentiel'
	| 'lieu'
	| 'dates-seances'
	| 'tarifs'
	| 'programme'
	| 'visuels'
	| 'pratique'
	| 'portfolio';

/**
 * The eight Event tabs, in the editor's order — EventEditor's own list and
 * the tabs Draft completeness is counted over (issue 013, ADR 0010).
 */
export const EVENT_EDITOR_TABS: readonly { id: EditorTabId; title: string }[] = [
	{ id: 'essentiel', title: 'Essentiel' },
	{ id: 'lieu', title: 'Lieu' },
	{ id: 'dates-seances', title: 'Dates & séances' },
	{ id: 'tarifs', title: 'Menus & tarifs' },
	{ id: 'programme', title: 'Programme' },
	{ id: 'visuels', title: 'Visuels' },
	{ id: 'pratique', title: 'Infos pratiques' },
	{ id: 'portfolio', title: 'Portfolio' },
];

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
	| 'visual-without-alt'
	| 'booking-window-opens-after-close'
	// The Portfolio list (issue 045)
	| 'missing-recap-en'
	| 'missing-recap-fr'
	| 'no-event-photo'
	| 'no-event-photo-cover'
	| 'event-photo-without-alt';

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
	/** How many of those Visuals lack alt text in English or in French
	 * (issue 043); absent: none known. */
	visualsWithoutAlt?: number;
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

	const withoutAlt = input.visualsWithoutAlt ?? 0;
	if (withoutAlt > 0) {
		warnings.push({
			code: 'visual-without-alt',
			message: `Visuel sans texte alternatif : ${
				withoutAlt === 1 ? 'un visuel n’a' : `${withoutAlt} visuels n’ont`
			} pas de texte alternatif en français ou en anglais.`,
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
	coverMedia?: ({ id: string } & MediaAltText) | null;
	/** Visuals and Event Photos alike (issue 045); only the Visuals count here. */
	media?: (RoledMedia & MediaAltText)[] | null;
}

/**
 * The Event's Visuals as the warnings count them (issue 013): how many it
 * has (its cover plus its gallery) and how many of those lack alt text in
 * a language. `altOverrides` holds the alt texts saved in « Visuels » or
 * « Portfolio » since the page data was loaded, by media id.
 */
export function visualCounts(
	event: Pick<EditorWarningsEvent, 'coverMediaId' | 'coverMedia' | 'media'>,
	altOverrides: Readonly<Record<string, MediaAltText>> = {}
): { visualCount: number; visualsWithoutAlt: number } {
	const cover = event.coverMediaId ?? event.coverMedia?.id ?? null;
	// Only the Visuals announce the Event; its Event Photos are the
	// Portfolio's (issue 045).
	const visualMedia = visualsOf(event.media);
	const gallery = visualMedia.filter((medium) => medium.id !== cover);
	const visualCount = (cover !== null ? 1 : 0) + gallery.length;
	// A cover known only by its id reads as lacking alt text.
	const coverMedium =
		cover === null
			? null
			: event.coverMedia?.id === cover
				? event.coverMedia
				: (visualMedia.find((medium) => medium.id === cover) ?? { id: cover });
	const visuals = [...(coverMedium ? [coverMedium] : []), ...gallery];
	const visualsWithoutAlt = visuals.filter((medium) =>
		lacksAltText({ ...medium, ...altOverrides[medium.id] })
	).length;
	return { visualCount, visualsWithoutAlt };
}

/**
 * The warnings for a saved Event, read off its row: its texts, Booking
 * Window, Time Zone and Visuals straight from the Event, its Services and
 * Seatings as the warnings read them. The editor's `editorEventWarnings`
 * follows what is typed (Seatings as wall-clock times); the Events list
 * (issue 013) reads what is stored, Seating instants and all.
 */
export function savedEventWarnings(
	event: EditorWarningsEvent,
	services: readonly WarningService[],
	seatings: readonly WarningSeating[],
	altOverrides: Readonly<Record<string, MediaAltText>> = {}
): EventWarning[] {
	return eventWarnings({
		titleEn: event.titleEn,
		titleFr: event.titleFr,
		descriptionEn: event.descriptionEn,
		descriptionFr: event.descriptionFr,
		locationEn: event.locationEn,
		locationFr: event.locationFr,
		services,
		seatings,
		...visualCounts(event, altOverrides),
		bookingWindow: {
			opensAt: event.bookingOpensAt ? new Date(event.bookingOpensAt) : null,
			closesHoursBefore: event.bookingClosesHoursBefore ?? null,
		},
		timeZone: event.timeZone,
	});
}

/**
 * The warnings for the Event the editor shows, read from its page data:
 * the Event's texts and Booking Window, its Seatings (« Dates & séances »,
 * typed on its clock) and each Service's Menu and price (« Menus &
 * tarifs »). `altOverrides` holds the alt texts saved in « Visuels »
 * since the page data was loaded, by media id.
 */
export function editorEventWarnings(
	event: EditorWarningsEvent,
	schedule: EditorService[],
	pricing: PricingEditorData,
	altOverrides: Readonly<Record<string, MediaAltText>> = {}
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
	return savedEventWarnings(event, services, seatings, altOverrides);
}

// ---------------------------------------------------------------------------
// The Portfolio list (issue 045)
// ---------------------------------------------------------------------------

/**
 * What the Portfolio list needs to know about an Event. As for publishing,
 * an absent field reads as missing.
 */
export interface PortfolioWarningsInput {
	recapEn?: string | null;
	recapFr?: string | null;
	/** How many Event Photos the Event has. */
	eventPhotoCount?: number;
	/** Whether one of them is the project cover. */
	hasEventPhotoCover?: boolean;
	/** How many Event Photos lack alt text in English or in French. */
	eventPhotosWithoutAlt?: number;
}

/**
 * What a Portfolio Event's project page lacks: the Recap per language,
 * Event Photos, their cover and their alt text — each fixed in the
 * « Portfolio » tab. Warnings only (ADR 0007): the one hard rule for the
 * Portfolio stays "once over" (Event access, issue 044).
 */
export function portfolioWarnings(input: PortfolioWarningsInput): EventWarning[] {
	const warnings: EventWarning[] = [];
	const add = (code: EventWarningCode, message: string) => warnings.push({ code, message, tab: 'portfolio' });

	if (!present(input.recapFr)) add('missing-recap-fr', 'Récap manquant en français.');
	if (!present(input.recapEn)) add('missing-recap-en', 'Récap manquant en anglais.');

	const count = input.eventPhotoCount ?? 0;
	if (count === 0) {
		add('no-event-photo', 'Aucune photo de l’événement : le projet s’affiche avec ses visuels d’annonce.');
	} else if (input.hasEventPhotoCover !== true) {
		add('no-event-photo-cover', 'Aucune photo de l’événement n’est choisie comme couverture du projet.');
	}

	const withoutAlt = input.eventPhotosWithoutAlt ?? 0;
	if (withoutAlt > 0) {
		add(
			'event-photo-without-alt',
			`Photo sans texte alternatif : ${
				withoutAlt === 1 ? 'une photo de l’événement n’a' : `${withoutAlt} photos de l’événement n’ont`
			} pas de texte alternatif en français ou en anglais.`
		);
	}

	return warnings;
}

/** What the editor knows about a saved Event for the Portfolio list. */
export interface EditorPortfolioEvent {
	recapEn?: string | null;
	recapFr?: string | null;
	media?: (RoledMedia & MediaAltText)[] | null;
}

/**
 * The Portfolio list for the Event the editor shows, read from its page
 * data. `altOverrides` holds the alt texts saved in « Portfolio » since
 * the page data was loaded, by media id.
 */
export function editorPortfolioWarnings(
	event: EditorPortfolioEvent,
	altOverrides: Readonly<Record<string, MediaAltText>> = {}
): EventWarning[] {
	const photos = eventPhotosOf(event.media);
	return portfolioWarnings({
		recapEn: event.recapEn,
		recapFr: event.recapFr,
		eventPhotoCount: photos.length,
		hasEventPhotoCover: photos.some((photo) => photo.isCover === true),
		eventPhotosWithoutAlt: photos.filter((photo) => lacksAltText({ ...photo, ...altOverrides[photo.id] })).length,
	});
}

// ---------------------------------------------------------------------------
// Draft completeness (issue 013, ADR 0010)
// ---------------------------------------------------------------------------

/** What is missing in one Event tab. */
export interface EventTabCompleteness {
	/** The tab, one of the eight Event tabs. */
	tab: EditorTabId;
	/** The tab's French title, as the editor labels it. */
	title: string;
	/** What is missing in the tab; empty when it has nothing missing. */
	warnings: EventWarning[];
}

/** An Event's completeness: what is missing per tab, and how many of the
 * eight Event tabs have nothing missing. */
export interface EventCompleteness {
	/** The eight Event tabs, in the editor's order. */
	tabs: EventTabCompleteness[];
	/** How many tabs have nothing missing. */
	complete: number;
	/** How many tabs are counted: the eight Event tabs. */
	total: number;
}

/**
 * Draft completeness (issue 013, ADR 0010): the editor's warnings grouped
 * by tab — what is missing in each of the eight Event tabs, and how many
 * have nothing missing (the « n/8 » the Events list shows on a Draft row).
 * The same warnings « À vérifier » lists; this adds no rules of its own,
 * and a tab no warning touches counts as complete.
 */
export function eventCompleteness(warnings: readonly EventWarning[]): EventCompleteness {
	const tabs: EventTabCompleteness[] = EVENT_EDITOR_TABS.map(({ id, title }) => ({
		tab: id,
		title,
		warnings: warnings.filter((warning) => warning.tab === id),
	}));
	return {
		tabs,
		complete: tabs.filter((tab) => tab.warnings.length === 0).length,
		total: tabs.length,
	};
}

/** Minutes since midnight of an `HH:MM` editor time (0 when malformed). */
function toMinutes(clock: string): number {
	const [hours, minutes] = clock.split(':').map(Number);
	return (hours || 0) * 60 + (minutes || 0);
}

import {
	eventWarnings,
	portfolioWarnings,
	visualCounts,
	type EditorPortfolioEvent,
	type EditorWarningsEvent,
	type EventWarning,
	type EventWarningsInput,
	type PortfolioWarningsInput,
	type WarningSeating,
	type WarningService,
} from './event-warnings';
import { wallClockToInstant } from './event-time';
import { parseTimeOfDay, type ServiceKind } from './seating-times';
import { eventPhotosOf, visualsOf } from './event-photos';
import { lacksAltText, type MediaAltText } from './media-alt';
import type { EditorService } from '$lib/types/seatings-editor';
import type { PricingEditorData } from '$lib/types/pricing-editor';

/**
 * « À vérifier » as you type (issue 021, ADR 0010) — pure, no database.
 *
 * The editor's warnings read the saved Event's page data merged with what
 * each tab currently holds, saved or not: a title typed, a price set, a
 * Seating added clears its item (and its tab's « missing » mark) before
 * any save. A tab that reports nothing reads as saved, so throwing away
 * held edits — the tab back to its saved values — brings the items back.
 *
 * Each tab reports its values as it edits them (texts as typed, prices in
 * major units, Seatings on the Event's clock); this module turns them into
 * the warnings' inputs.
 */

/** What « Essentiel » holds. */
export interface EssentielValues {
	titleEn: string;
	titleFr: string;
	descriptionEn: string;
	descriptionFr: string;
}

/** What « Lieu » holds. */
export interface LieuValues {
	locationEn: string;
	locationFr: string;
}

/** What « Dates & séances » holds: the Seatings per Service, typed on the
 * Event's clock, and the Booking Window as typed. */
export interface SeatingsValues {
	services: readonly { date: string; seatings: readonly { start: string }[] }[];
	/** `YYYY-MM-DDTHH:MM` on the Event's clock; blank: none. */
	bookingOpensAt: string;
	bookingClosesHoursBefore: number | null;
}

/** What « Menus & tarifs » holds: each Service's Menu and price. */
export interface PricingValues {
	services: readonly {
		serviceId: string;
		date: string;
		kind: ServiceKind;
		/** The Menu offered; blank: none. */
		menuKey: string;
		/** Major units as typed; blank or null: not set. */
		price: number | null | '';
	}[];
}

/** What « Visuels » holds: the cover and the gallery, by media id. */
export interface VisualsValues {
	coverMediaId: string | null;
	galleryMediaIds: readonly string[];
}

/** What « Portfolio » holds: the Recap and the Event Photos. */
export interface PortfolioValues {
	recapEn: string;
	recapFr: string;
	photos: readonly ({ id: string } & MediaAltText)[];
	coverId: string | null;
}

/** Each tab's current values; a tab left out reads as saved. */
export interface UnsavedEditorValues {
	essentiel?: EssentielValues;
	lieu?: LieuValues;
	seatings?: SeatingsValues;
	pricing?: PricingValues;
	visuels?: VisualsValues;
	portfolio?: PortfolioValues;
}

/** The saved Event as the editor's page data has it. */
export interface SavedEditorValues {
	event: EditorWarningsEvent & EditorPortfolioEvent;
	schedule: readonly EditorService[];
	pricing: Pick<PricingEditorData, 'services'>;
}

/** Minutes since midnight of an `HH:MM` time; a blank one counts as a
 * Seating all the same (at midnight). */
function minutesOf(clock: string): number {
	return parseTimeOfDay(clock) ?? 0;
}

/** A Booking Window opening typed on the Event's clock, as an instant. */
function openingOf(typed: string, zone: string): Date | null {
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(typed.trim());
	if (!match) return null;
	const minutes = parseTimeOfDay(match[2]);
	return minutes === null ? null : wallClockToInstant(match[1], minutes, zone);
}

function priceAmountOf(price: number | null | ''): number | null {
	return typeof price === 'number' && Number.isFinite(price) ? Math.round(price * 100) : null;
}

/**
 * The warnings' inputs for the Event the editor shows: the saved page data
 * with each tab's current values laid over it. `altOverrides` holds the
 * alt texts saved since the page data was loaded, by media id.
 */
export function liveWarningInputs(
	saved: SavedEditorValues,
	unsaved: UnsavedEditorValues = {},
	altOverrides: Readonly<Record<string, MediaAltText>> = {}
): { publishing: EventWarningsInput; portfolio: PortfolioWarningsInput } {
	const { event } = saved;
	const zone = event.timeZone;

	const schedule = unsaved.seatings?.services ?? saved.schedule;
	const seatings: WarningSeating[] = schedule.flatMap((service) =>
		service.seatings.map((seating) => ({
			startTime: wallClockToInstant(service.date, minutesOf(seating.start), zone),
		}))
	);

	const services: WarningService[] = unsaved.pricing
		? unsaved.pricing.services.map((service) => ({
				serviceId: service.serviceId,
				date: service.date,
				kind: service.kind,
				menuId: service.menuKey === '' ? null : service.menuKey,
				priceAmount: priceAmountOf(service.price),
			}))
		: saved.pricing.services.map((service) => ({
				serviceId: service.serviceId,
				date: service.date,
				kind: service.kind,
				menuId: service.menuId,
				priceAmount: service.priceAmount,
			}));

	const bookingWindow = unsaved.seatings
		? {
				opensAt: openingOf(unsaved.seatings.bookingOpensAt, zone),
				closesHoursBefore:
					typeof unsaved.seatings.bookingClosesHoursBefore === 'number' &&
					Number.isFinite(unsaved.seatings.bookingClosesHoursBefore)
						? unsaved.seatings.bookingClosesHoursBefore
						: null,
			}
		: {
				opensAt: event.bookingOpensAt ? new Date(event.bookingOpensAt) : null,
				closesHoursBefore: event.bookingClosesHoursBefore ?? null,
			};

	const publishing: EventWarningsInput = {
		titleEn: unsaved.essentiel?.titleEn ?? event.titleEn,
		titleFr: unsaved.essentiel?.titleFr ?? event.titleFr,
		descriptionEn: unsaved.essentiel?.descriptionEn ?? event.descriptionEn,
		descriptionFr: unsaved.essentiel?.descriptionFr ?? event.descriptionFr,
		locationEn: unsaved.lieu?.locationEn ?? event.locationEn,
		locationFr: unsaved.lieu?.locationFr ?? event.locationFr,
		services,
		seatings,
		...visualCounts(unsaved.visuels ? visualsEvent(event, unsaved.visuels) : event, altOverrides),
		bookingWindow,
		timeZone: zone,
	};

	const savedPhotos = eventPhotosOf(event.media);
	const photos = unsaved.portfolio?.photos ?? savedPhotos;
	const coverId = unsaved.portfolio
		? unsaved.portfolio.coverId
		: (savedPhotos.find((photo) => photo.isCover === true)?.id ?? null);
	const portfolio: PortfolioWarningsInput = {
		recapEn: unsaved.portfolio?.recapEn ?? event.recapEn,
		recapFr: unsaved.portfolio?.recapFr ?? event.recapFr,
		eventPhotoCount: photos.length,
		hasEventPhotoCover: coverId !== null && photos.some((photo) => photo.id === coverId),
		eventPhotosWithoutAlt: photos.filter((photo) => lacksAltText({ ...photo, ...altOverrides[photo.id] })).length,
	};

	return { publishing, portfolio };
}

/** The saved Event with « Visuels »' current cover and gallery: media it
 * already knows keep their alt texts, a new upload has none yet. */
function visualsEvent(
	event: SavedEditorValues['event'],
	visuals: VisualsValues
): Pick<EditorWarningsEvent, 'coverMediaId' | 'coverMedia' | 'media'> {
	const known = new Map<string, MediaAltText>();
	for (const medium of visualsOf(event.media)) known.set(medium.id, medium);
	if (event.coverMedia) known.set(event.coverMedia.id, event.coverMedia);
	const withAlt = (id: string) => ({ ...known.get(id), id, role: 'visual' as const });
	const ids = [...new Set([...(visuals.coverMediaId ? [visuals.coverMediaId] : []), ...visuals.galleryMediaIds])];
	return {
		coverMediaId: visuals.coverMediaId,
		coverMedia: visuals.coverMediaId ? withAlt(visuals.coverMediaId) : null,
		media: ids.map(withAlt),
	};
}

/**
 * The editor's warnings as you type: what is missing for publishing, and
 * the Portfolio list, from the saved page data and each tab's current
 * values. With no tab values it is what `editorEventWarnings` and
 * `editorPortfolioWarnings` read off the saved data.
 */
export function liveEditorWarnings(
	saved: SavedEditorValues,
	unsaved: UnsavedEditorValues = {},
	altOverrides: Readonly<Record<string, MediaAltText>> = {}
): { publishing: EventWarning[]; portfolio: EventWarning[] } {
	const inputs = liveWarningInputs(saved, unsaved, altOverrides);
	return { publishing: eventWarnings(inputs.publishing), portfolio: portfolioWarnings(inputs.portfolio) };
}

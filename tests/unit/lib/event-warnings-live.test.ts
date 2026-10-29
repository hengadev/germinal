import { describe, it, expect } from 'vitest';
import {
	liveEditorWarnings,
	liveWarningInputs,
	type SavedEditorValues,
	type SeatingsValues,
	type PricingValues,
} from '../../../src/lib/utils/event-warnings-live';
import {
	editorEventWarnings,
	editorPortfolioWarnings,
	eventCompleteness,
	type EditorWarningsEvent,
} from '../../../src/lib/utils/event-warnings';
import type { EditorService } from '../../../src/lib/types/seatings-editor';
import type { PricingEditorData } from '../../../src/lib/types/pricing-editor';
import { FULL_PAYMENT_DEPOSIT } from '../../../src/lib/utils/pricing';
import { DEFAULT_REFUND_POLICY } from '../../../src/lib/utils/refund-policy';

/**
 * Issue 021 — « À vérifier » as you type: the saved page data merged with
 * each tab's current values. A tab that reports nothing reads as saved.
 */

const ZONE = 'Europe/Paris';

const EVENT: EditorWarningsEvent & { recapEn: string | null; recapFr: string | null } = {
	titleEn: 'A Night at the Salon',
	titleFr: 'Une soirée au salon',
	descriptionEn: 'An intimate dinner.',
	descriptionFr: 'Un dîner intimiste.',
	locationEn: 'The Salon, Paris',
	locationFr: 'Le Salon, Paris',
	timeZone: ZONE,
	bookingOpensAt: null,
	bookingClosesHoursBefore: null,
	coverMediaId: 'cover',
	coverMedia: { id: 'cover', altEn: 'A laid table', altFr: 'Une table dressée' },
	media: [
		{ id: 'cover', role: 'visual', altEn: 'A laid table', altFr: 'Une table dressée' },
		{ id: 'gallery', role: 'visual', altEn: 'The chef', altFr: 'Le chef' },
		{ id: 'photo', role: 'event_photo', isCover: true, altEn: 'Guests', altFr: 'Les convives' },
	],
	recapEn: 'It took place.',
	recapFr: 'Cela a eu lieu.',
};

const SCHEDULE: EditorService[] = [
	{
		serviceId: 's1',
		date: '2027-03-12',
		kind: 'dinner',
		defaultDurationMinutes: 180,
		seatings: [
			{
				id: 'seating-1',
				start: '19:00',
				end: '22:00',
				titleEn: null,
				titleFr: null,
				descriptionEn: null,
				descriptionFr: null,
				totalCapacity: 20,
				availableCapacity: 20,
				heldSeats: 0,
				capacityOverridden: false,
				published: true,
				allowWaitlist: true,
				badgeType: 'none',
				reservationCount: 0,
			},
		],
	},
];

const PRICING: PricingEditorData = {
	menus: [{ id: 'm1', nameEn: 'Spring', nameFr: 'Printemps', courses: [], descriptionEn: null, descriptionFr: null }],
	services: [
		{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: 'm1', priceAmount: 9000, seatingCount: 1, legacySeatings: [] },
	],
	deposit: FULL_PAYMENT_DEPOSIT,
	refundPolicy: DEFAULT_REFUND_POLICY,
	currency: 'EUR',
	currencyLocked: false,
};

const SAVED: SavedEditorValues = { event: EVENT, schedule: SCHEDULE, pricing: PRICING };

const SEATINGS: SeatingsValues = {
	services: [{ date: '2027-03-12', seatings: [{ start: '19:00' }] }],
	bookingOpensAt: '',
	bookingClosesHoursBefore: null,
};

const PRICES: PricingValues = {
	services: [{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuKey: 'm1', price: 90 }],
};

const codes = (...args: Parameters<typeof liveEditorWarnings>) =>
	liveEditorWarnings(...args).publishing.map((warning) => warning.code);

describe('liveEditorWarnings — no unsaved values', () => {
	it('reads the saved page data as the editor always did', () => {
		expect(liveEditorWarnings(SAVED).publishing).toEqual(editorEventWarnings(EVENT, SCHEDULE, PRICING));
		expect(liveEditorWarnings(SAVED).portfolio).toEqual(editorPortfolioWarnings(EVENT));
	});

	it('matches the saved warnings for an incomplete Event too', () => {
		const event = { ...EVENT, titleEn: null, coverMediaId: null, coverMedia: null, media: [], recapFr: null };
		const pricing = { ...PRICING, services: [{ ...PRICING.services[0], menuId: null, priceAmount: null }] };
		const saved = { event, schedule: [], pricing };
		expect(liveEditorWarnings(saved).publishing).toEqual(editorEventWarnings(event, [], pricing));
		expect(liveEditorWarnings(saved).portfolio).toEqual(editorPortfolioWarnings(event));
	});

	it('reads tab values equal to the saved ones as saved', () => {
		const unsaved = {
			essentiel: { titleEn: EVENT.titleEn!, titleFr: EVENT.titleFr!, descriptionEn: EVENT.descriptionEn!, descriptionFr: EVENT.descriptionFr! },
			lieu: { locationEn: EVENT.locationEn!, locationFr: EVENT.locationFr! },
			seatings: SEATINGS,
			pricing: PRICES,
			visuels: { coverMediaId: 'cover', galleryMediaIds: ['gallery'] },
			portfolio: { recapEn: EVENT.recapEn!, recapFr: EVENT.recapFr!, photos: [EVENT.media![2]], coverId: 'photo' },
		};
		expect(liveWarningInputs(SAVED, unsaved)).toEqual(liveWarningInputs(SAVED));
	});
});

describe('liveEditorWarnings — texts (« Essentiel », « Lieu »)', () => {
	const saved = { ...SAVED, event: { ...EVENT, titleFr: null, locationEn: null } };

	it('clears an item as soon as the missing text is typed', () => {
		expect(codes(saved)).toEqual(['missing-title-fr', 'missing-location-en']);
		expect(
			codes(saved, {
				essentiel: { titleEn: EVENT.titleEn!, titleFr: 'Une soirée', descriptionEn: EVENT.descriptionEn!, descriptionFr: EVENT.descriptionFr! },
				lieu: { locationEn: 'The Salon', locationFr: EVENT.locationFr! },
			})
		).toEqual([]);
	});

	it('brings an item back when a saved text is cleared', () => {
		expect(
			codes(SAVED, {
				essentiel: { titleEn: EVENT.titleEn!, titleFr: '  ', descriptionEn: EVENT.descriptionEn!, descriptionFr: EVENT.descriptionFr! },
			})
		).toEqual(['missing-title-fr']);
	});

	it('brings the items back once the tab is back to its saved values (held edits discarded)', () => {
		const typed = codes(saved, {
			essentiel: { titleEn: EVENT.titleEn!, titleFr: 'Une soirée', descriptionEn: EVENT.descriptionEn!, descriptionFr: EVENT.descriptionFr! },
		});
		expect(typed).toEqual(['missing-location-en']);
		expect(
			codes(saved, {
				essentiel: { titleEn: EVENT.titleEn!, titleFr: '', descriptionEn: EVENT.descriptionEn!, descriptionFr: EVENT.descriptionFr! },
			})
		).toEqual(['missing-title-fr', 'missing-location-en']);
	});
});

describe('liveEditorWarnings — Seatings (« Dates & séances »)', () => {
	it('clears « no Seating » when one is added, before it is saved', () => {
		const saved = { ...SAVED, schedule: [] };
		expect(codes(saved)).toEqual(['no-seating']);
		expect(codes(saved, { seatings: SEATINGS })).toEqual([]);
	});

	it('warns when every Seating is removed', () => {
		expect(codes(SAVED, { seatings: { ...SEATINGS, services: [{ date: '2027-03-12', seatings: [] }] } })).toEqual(['no-seating']);
	});

	it('reads the Booking Window as typed, on the Event’s clock', () => {
		// 19:00 Paris: the window opens exactly when the Seating's bookings close.
		expect(codes(SAVED, { seatings: { ...SEATINGS, bookingOpensAt: '2027-03-12T19:00' } })).toEqual([
			'booking-window-opens-after-close',
		]);
		expect(codes(SAVED, { seatings: { ...SEATINGS, bookingOpensAt: '2027-03-12T18:59' } })).toEqual([]);
		expect(
			codes(SAVED, { seatings: { ...SEATINGS, bookingOpensAt: '2027-03-12T17:00', bookingClosesHoursBefore: 2 } })
		).toEqual(['booking-window-opens-after-close']);
	});

	it('reads a blank or half-typed opening as none', () => {
		const saved = { ...SAVED, event: { ...EVENT, bookingOpensAt: new Date('2027-03-12T18:00:00Z') } };
		expect(codes(saved)).toEqual(['booking-window-opens-after-close']);
		expect(codes(saved, { seatings: { ...SEATINGS, bookingOpensAt: '' } })).toEqual([]);
		expect(codes(saved, { seatings: { ...SEATINGS, bookingOpensAt: '2027-03-12T' } })).toEqual([]);
	});
});

describe('liveEditorWarnings — prices and Menus (« Menus & tarifs »)', () => {
	const unpriced = { ...SAVED, pricing: { ...PRICING, services: [{ ...PRICING.services[0], menuId: null, priceAmount: null }] } };

	it('clears an item as soon as a price is typed or a Menu chosen', () => {
		expect(codes(unpriced)).toEqual(['service-without-price', 'service-without-menu']);
		expect(codes(unpriced, { pricing: PRICES })).toEqual([]);
		expect(codes(unpriced, { pricing: { services: [{ ...PRICES.services[0], menuKey: 'new-3', price: 0 }] } })).toEqual([]);
	});

	it('reads a blank price and no Menu as missing', () => {
		expect(codes(SAVED, { pricing: { services: [{ ...PRICES.services[0], menuKey: '', price: '' }] } })).toEqual([
			'service-without-price',
			'service-without-menu',
		]);
		expect(codes(SAVED, { pricing: { services: [{ ...PRICES.services[0], price: null }] } })).toEqual(['service-without-price']);
	});
});

describe('liveEditorWarnings — Visuals (« Visuels »)', () => {
	it('follows the cover and gallery as picked', () => {
		expect(codes(SAVED, { visuels: { coverMediaId: null, galleryMediaIds: [] } })).toEqual(['no-visual']);
		expect(codes(SAVED, { visuels: { coverMediaId: 'gallery', galleryMediaIds: ['gallery'] } })).toEqual([]);
	});

	it('reads a new upload as lacking alt text until its alt texts are saved', () => {
		const visuels = { coverMediaId: 'cover', galleryMediaIds: ['gallery', 'upload'] };
		expect(codes(SAVED, { visuels })).toEqual(['visual-without-alt']);
		expect(codes(SAVED, { visuels }, { upload: { altEn: 'The garden', altFr: 'Le jardin' } })).toEqual([]);
	});
});

describe('liveEditorWarnings — the Portfolio list (« Portfolio »)', () => {
	const photo = { id: 'photo', altEn: 'Guests', altFr: 'Les convives' };
	const portfolio = (values: Partial<{ recapEn: string; recapFr: string; photos: typeof photo[]; coverId: string | null }>) =>
		liveEditorWarnings(SAVED, {
			portfolio: { recapEn: EVENT.recapEn!, recapFr: EVENT.recapFr!, photos: [photo], coverId: 'photo', ...values },
		}).portfolio.map((warning) => warning.code);

	it('follows the Recap and Event Photos as edited', () => {
		expect(portfolio({})).toEqual([]);
		expect(portfolio({ recapEn: '' })).toEqual(['missing-recap-en']);
		expect(portfolio({ photos: [], coverId: null })).toEqual(['no-event-photo']);
		expect(portfolio({ coverId: null })).toEqual(['no-event-photo-cover']);
		expect(portfolio({ photos: [photo, { id: 'new', altEn: null, altFr: null } as never] })).toEqual(['event-photo-without-alt']);
	});
});

describe('eventCompleteness of the live warnings', () => {
	it('clears a tab’s missing mark as soon as its item is fixed', () => {
		const saved = { ...SAVED, event: { ...EVENT, titleFr: null } };
		const missing = (unsaved = {}) =>
			eventCompleteness(liveEditorWarnings(saved, unsaved).publishing)
				.tabs.filter((tab) => tab.warnings.length > 0)
				.map((tab) => tab.tab);
		expect(missing()).toEqual(['essentiel']);
		expect(
			missing({
				essentiel: { titleEn: EVENT.titleEn!, titleFr: 'Une soirée', descriptionEn: EVENT.descriptionEn!, descriptionFr: EVENT.descriptionFr! },
			})
		).toEqual([]);
	});
});

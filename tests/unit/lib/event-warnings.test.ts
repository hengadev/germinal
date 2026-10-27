import { describe, it, expect } from 'vitest';
import {
	editorEventWarnings,
	editorPortfolioWarnings,
	eventCompleteness,
	eventWarnings,
	portfolioWarnings,
	savedEventWarnings,
	type PortfolioWarningsInput,
	type EditorWarningsEvent,
	type EventWarningsInput,
	type EventWarningCode,
} from '../../../src/lib/utils/event-warnings';
import { wallClockToInstant } from '../../../src/lib/utils/event-time';
import type { EditorService } from '../../../src/lib/types/seatings-editor';
import type { PricingEditorData } from '../../../src/lib/types/pricing-editor';
import { FULL_PAYMENT_DEPOSIT } from '../../../src/lib/utils/pricing';
import { DEFAULT_REFUND_POLICY } from '../../../src/lib/utils/refund-policy';

/**
 * Issue 038 — the Event warnings module: what is missing for publishing,
 * each item with a code, a French message and the tab that fixes it. Each
 * item is tested present and absent; publishing is never refused (ADR 0008).
 */

const ZONE = 'Europe/Paris';

// A complete Event: one dinner Service with a Menu and a price, one
// Seating, both languages filled in, a Visual and the default window.
const COMPLETE: EventWarningsInput = {
	titleEn: 'A Night at the Salon',
	titleFr: 'Une soirée au salon',
	descriptionEn: 'An intimate dinner.',
	descriptionFr: 'Un dîner intimiste.',
	locationEn: 'The Salon, Paris',
	locationFr: 'Le Salon, Paris',
	services: [{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: 'm1', priceAmount: 9000 }],
	seatings: [{ startTime: new Date('2027-03-12T19:00:00Z') }],
	visualCount: 1,
	bookingWindow: { opensAt: null, closesHoursBefore: null },
	timeZone: ZONE,
};

const codes = (input: EventWarningsInput) => eventWarnings(input).map((warning) => warning.code);

describe('eventWarnings', () => {
	it('lists nothing for a complete Event', () => {
		expect(eventWarnings(COMPLETE)).toEqual([]);
	});

	it.each([
		['no-seating', { seatings: [] }],
		['service-without-price', { services: [{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: 'm1', priceAmount: null }] }],
		['service-without-menu', { services: [{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: null, priceAmount: 9000 }] }],
		['missing-title-en', { titleEn: null }],
		['missing-title-fr', { titleFr: null }],
		['missing-description-en', { descriptionEn: '  ' }],
		['missing-description-fr', { descriptionFr: null }],
		['missing-location-en', { locationEn: null }],
		['missing-location-fr', { locationFr: null }],
		['no-visual', { visualCount: 0 }],
		['visual-without-alt', { visualsWithoutAlt: 1 }],
	] as [EventWarningCode, Partial<EventWarningsInput>][])(
		'warns with %s when it is missing, and not when it is not',
		(code, missing) => {
			expect(codes({ ...COMPLETE, ...missing })).toContain(code);
			expect(codes(COMPLETE)).not.toContain(code);
		}
	);

	it('names the Service concerned, in French', () => {
		const [warning] = eventWarnings({
			...COMPLETE,
			services: [{ serviceId: 's1', date: '2027-03-12', kind: 'lunch', menuId: null, priceAmount: null }],
		}).filter((warning) => warning.code === 'service-without-price');
		expect(warning.message).toContain('déjeuner du vendredi 12 mars 2027');
		expect(warning.message).toContain('n’a pas de prix');
	});

	it('sends each item to the tab that fixes it', () => {
		const byCode = new Map(
			eventWarnings({
				...COMPLETE,
				titleFr: null,
				locationEn: null,
				services: [{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: null, priceAmount: null }],
				seatings: [],
				visualCount: 0,
			}).map((warning) => [warning.code, warning.tab])
		);
		expect(byCode.get('no-seating')).toBe('dates-seances');
		expect(byCode.get('service-without-price')).toBe('tarifs');
		expect(byCode.get('service-without-menu')).toBe('tarifs');
		expect(byCode.get('missing-title-fr')).toBe('essentiel');
		expect(byCode.get('missing-location-en')).toBe('lieu');
		expect(byCode.get('no-visual')).toBe('visuels');
		expect(
			eventWarnings({ ...COMPLETE, visualsWithoutAlt: 2 }).find((w) => w.code === 'visual-without-alt')?.tab
		).toBe('visuels');
	});

	it('lists a Visual without alt text, in French (issue 043)', () => {
		const [one] = eventWarnings({ ...COMPLETE, visualsWithoutAlt: 1 });
		expect(one.message).toContain('Visuel sans texte alternatif');
		expect(one.message).toContain('un visuel n’a pas');
		const [two] = eventWarnings({ ...COMPLETE, visualsWithoutAlt: 2 });
		expect(two.message).toContain('2 visuels n’ont pas');
	});

	it('warns on a Booking Window that opens after a Seating closes', () => {
		// Opens at 20:00 while bookings close at the Seating's 19:00 start.
		const input: EventWarningsInput = {
			...COMPLETE,
			bookingWindow: { opensAt: new Date('2027-03-12T19:00:00Z'), closesHoursBefore: null },
		};
		expect(codes(input)).toContain('booking-window-opens-after-close');
		const [warning] = eventWarnings(input);
		expect(warning.tab).toBe('dates-seances');
		// Placed on the Event's clock (Paris, UTC+1 in March).
		expect(warning.message).toContain('20:00');
	});

	it('does not warn when the window opens before the Seating closes', () => {
		// Opens at 12:00, closes 6 hours before the 19:00 start (13:00).
		expect(
			codes({
				...COMPLETE,
				bookingWindow: { opensAt: new Date('2027-03-12T11:00:00Z'), closesHoursBefore: 6 },
			})
		).not.toContain('booking-window-opens-after-close');
		// Opening exactly at the closing instant is already closed there.
		expect(
			codes({
				...COMPLETE,
				bookingWindow: { opensAt: new Date('2027-03-12T13:00:00Z'), closesHoursBefore: 6 },
			})
		).toContain('booking-window-opens-after-close');
	});

	it('ignores the window when it has no opening instant', () => {
		expect(
			codes({ ...COMPLETE, bookingWindow: { opensAt: null, closesHoursBefore: 48 } })
		).not.toContain('booking-window-opens-after-close');
	});

	it('reads absent snapshot fields as missing, never as present', () => {
		const all = codes({});
		expect(all).toContain('no-seating');
		expect(all).toContain('missing-title-en');
		expect(all).toContain('missing-title-fr');
		expect(all).toContain('no-visual');
	});

	it('treats a zero price as set', () => {
		expect(
			codes({
				...COMPLETE,
				services: [{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: 'm1', priceAmount: 0 }],
			})
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Reading the editor's page data
// ---------------------------------------------------------------------------

const EVENT: EditorWarningsEvent = {
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
		{ id: 'cover', altEn: 'A laid table', altFr: 'Une table dressée' },
		{ id: 'gallery', altEn: 'The chef', altFr: 'Le chef' },
	],
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
	menus: [{ id: 'm1', nameEn: 'Spring', nameFr: 'Printemps', descriptionEn: null, descriptionFr: null }],
	services: [
		{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: 'm1', priceAmount: 9000, seatingCount: 1, legacySeatings: [] },
	],
	deposit: FULL_PAYMENT_DEPOSIT,
	refundPolicy: DEFAULT_REFUND_POLICY,
	currency: 'EUR',
	currencyLocked: false,
};

describe('editorEventWarnings', () => {
	it('lists nothing for a complete saved Event', () => {
		expect(editorEventWarnings(EVENT, SCHEDULE, PRICING)).toEqual([]);
	});

	it('reads the Seatings and prices off the page data', () => {
		const warnings = editorEventWarnings(
			EVENT,
			SCHEDULE,
			{ ...PRICING, services: [{ ...PRICING.services[0], menuId: null, priceAmount: null }] }
		);
		expect(warnings.map((warning) => warning.code)).toEqual(['service-without-price', 'service-without-menu']);
	});

	it('places the Seating on the Event’s clock for the Booking Window', () => {
		const warnings = editorEventWarnings(
			{ ...EVENT, bookingOpensAt: new Date('2027-03-12T18:00:00.000Z') },
			SCHEDULE,
			PRICING
		);
		// 18:00 UTC is 19:00 Paris: the window opens exactly when the
		// Seating's bookings close (at its start), so it warns.
		expect(warnings.map((warning) => warning.code)).toEqual(['booking-window-opens-after-close']);
	});

	it('counts only the Visuals the Event has', () => {
		expect(editorEventWarnings({ ...EVENT, coverMediaId: null, coverMedia: null, media: [] }, SCHEDULE, PRICING).map((w) => w.code)).toContain('no-visual');
		expect(editorEventWarnings({ ...EVENT, media: [] }, SCHEDULE, PRICING)).toEqual([]);
	});

	it('counts the Visuals lacking alt text in either language (issue 043)', () => {
		const warnings = editorEventWarnings(
			{
				...EVENT,
				coverMedia: { id: 'cover', altEn: 'A laid table', altFr: null },
				media: [{ id: 'cover' }, { id: 'gallery', altEn: '  ', altFr: '  ' }],
			},
			SCHEDULE,
			PRICING
		);
		expect(warnings.map((w) => w.code)).toEqual(['visual-without-alt']);
		expect(warnings[0].message).toContain('2 visuels');
	});

	it('reads a cover known only by its id as lacking alt text', () => {
		expect(
			editorEventWarnings({ ...EVENT, coverMedia: null, media: [] }, SCHEDULE, PRICING).map((w) => w.code)
		).toEqual(['visual-without-alt']);
	});

	it('follows the alt texts saved since the page data was loaded', () => {
		const event = { ...EVENT, media: [{ id: 'cover' }, { id: 'gallery' }], coverMedia: { id: 'cover' } };
		expect(editorEventWarnings(event, SCHEDULE, PRICING).map((w) => w.code)).toEqual(['visual-without-alt']);
		expect(
			editorEventWarnings(event, SCHEDULE, PRICING, {
				cover: { altEn: 'A laid table', altFr: 'Une table dressée' },
				gallery: { altEn: 'The chef', altFr: 'Le chef' },
			})
		).toEqual([]);
	});
});

describe('editorEventWarnings and Event Photos (issue 045)', () => {
	it('never counts Event Photos as Visuals', () => {
		const photo = { id: 'photo', role: 'event_photo' as const, isCover: true, altEn: null, altFr: null };
		const event = { ...EVENT, coverMediaId: null, coverMedia: null, media: [photo] };
		// No Visual at all: the Event Photo neither stands in for one nor
		// is flagged for its missing alt text here.
		expect(editorEventWarnings(event, SCHEDULE, PRICING).map((w) => w.code)).toEqual(['no-visual']);
	});
});

// A complete Portfolio project: both Recaps, Event Photos with a cover and
// alt texts.
const COMPLETE_PROJECT: PortfolioWarningsInput = {
	recapEn: 'Forty guests shared a long table.',
	recapFr: 'Quarante convives autour d’une longue table.',
	eventPhotoCount: 3,
	hasEventPhotoCover: true,
	eventPhotosWithoutAlt: 0,
};

const projectCodes = (input: PortfolioWarningsInput) => portfolioWarnings(input).map((warning) => warning.code);

describe('portfolioWarnings (issue 045)', () => {
	it('lists nothing for a complete project', () => {
		expect(portfolioWarnings(COMPLETE_PROJECT)).toEqual([]);
	});

	it('warns for a missing Recap in each language, blank included', () => {
		expect(projectCodes({ ...COMPLETE_PROJECT, recapFr: null })).toEqual(['missing-recap-fr']);
		expect(projectCodes({ ...COMPLETE_PROJECT, recapEn: '   ' })).toEqual(['missing-recap-en']);
	});

	it('warns when there is no Event Photo, without also asking for a cover', () => {
		expect(projectCodes({ ...COMPLETE_PROJECT, eventPhotoCount: 0, hasEventPhotoCover: false })).toEqual(['no-event-photo']);
	});

	it('warns when Event Photos have no cover', () => {
		expect(projectCodes({ ...COMPLETE_PROJECT, hasEventPhotoCover: false })).toEqual(['no-event-photo-cover']);
	});

	it('counts the Event Photos lacking alt text', () => {
		const one = portfolioWarnings({ ...COMPLETE_PROJECT, eventPhotosWithoutAlt: 1 });
		expect(one.map((w) => w.code)).toEqual(['event-photo-without-alt']);
		expect(one[0].message).toContain('une photo');
		expect(portfolioWarnings({ ...COMPLETE_PROJECT, eventPhotosWithoutAlt: 2 })[0].message).toContain('2 photos');
	});

	it('reads an empty snapshot as missing everything', () => {
		expect(projectCodes({})).toEqual(['missing-recap-fr', 'missing-recap-en', 'no-event-photo']);
	});

	it('sends every item to the Portfolio tab', () => {
		expect(new Set(portfolioWarnings({}).map((w) => w.tab))).toEqual(new Set(['portfolio']));
	});
});

describe('editorPortfolioWarnings (issue 045)', () => {
	const photo = (id: string, extra: Record<string, unknown> = {}) => ({
		id,
		role: 'event_photo' as const,
		isCover: false,
		altEn: 'Guests at the table',
		altFr: 'Les convives à table',
		...extra,
	});
	const recaps = { recapEn: 'It took place.', recapFr: 'Cela a eu lieu.' };

	it('reads only the Event Photos, never the Visuals', () => {
		const visual = { id: 'visual', role: 'visual' as const, isCover: true, altEn: null, altFr: null };
		expect(editorPortfolioWarnings({ ...recaps, media: [visual] }).map((w) => w.code)).toEqual(['no-event-photo']);
		// Media from before roles read as Visuals too.
		expect(editorPortfolioWarnings({ ...recaps, media: [{ id: 'old', isCover: true }] }).map((w) => w.code)).toEqual(['no-event-photo']);
	});

	it('finds the cover among the Event Photos', () => {
		expect(editorPortfolioWarnings({ ...recaps, media: [photo('a'), photo('b', { isCover: true })] })).toEqual([]);
		expect(editorPortfolioWarnings({ ...recaps, media: [photo('a')] }).map((w) => w.code)).toEqual(['no-event-photo-cover']);
	});

	it('follows the alt texts saved since the page data was loaded', () => {
		const event = { ...recaps, media: [photo('a', { isCover: true, altEn: null })] };
		expect(editorPortfolioWarnings(event).map((w) => w.code)).toEqual(['event-photo-without-alt']);
		expect(editorPortfolioWarnings(event, { a: { altEn: 'The table', altFr: 'La table' } })).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Draft completeness (issue 013, ADR 0010)
// ---------------------------------------------------------------------------

describe('savedEventWarnings (issue 013)', () => {
	it('reads a saved Event with the editor’s rules', () => {
		const warnings = savedEventWarnings(
			{ ...EVENT, titleEn: null, coverMediaId: null, coverMedia: null, media: [] },
			[{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: null, priceAmount: null }],
			[{ startTime: wallClockToInstant('2027-03-12', 19 * 60, ZONE) }]
		);
		expect(warnings.map((warning) => warning.code)).toEqual([
			'service-without-price',
			'service-without-menu',
			'missing-title-en',
			'no-visual',
		]);
	});

	it('agrees with editorEventWarnings on the same saved Event', () => {
		expect(
			savedEventWarnings(
				EVENT,
				[{ serviceId: 's1', date: '2027-03-12', kind: 'dinner', menuId: 'm1', priceAmount: 9000 }],
				[{ startTime: wallClockToInstant('2027-03-12', 19 * 60, ZONE) }]
			)
		).toEqual(editorEventWarnings(EVENT, SCHEDULE, PRICING));
	});
});

describe('eventCompleteness (issue 013)', () => {
	it('groups the warnings per tab, the eight Event tabs in the editor’s order', () => {
		const completeness = eventCompleteness(eventWarnings({}));
		expect(completeness.tabs.map((tab) => tab.tab)).toEqual([
			'essentiel',
			'lieu',
			'dates-seances',
			'tarifs',
			'programme',
			'visuels',
			'pratique',
			'portfolio',
		]);
		// A tab no warning touches holds nothing.
		expect(completeness.tabs.find((tab) => tab.tab === 'programme')?.warnings).toEqual([]);
		expect(completeness.tabs.find((tab) => tab.tab === 'pratique')?.warnings).toEqual([]);
	});

	it('labels each tab as the editor does', () => {
		expect(eventCompleteness([]).tabs.map((tab) => tab.title)).toEqual([
			'Essentiel',
			'Lieu',
			'Dates & séances',
			'Menus & tarifs',
			'Programme',
			'Visuels',
			'Infos pratiques',
			'Portfolio',
		]);
	});

	it('counts only the tabs a rule checks', () => {
		// An empty snapshot: Essentiel (titles, descriptions), Lieu, Dates &
		// séances (no Seating) and Visuels lack something; Tarifs has no
		// Service to warn about. Programme and Infos pratiques have no rule,
		// and Portfolio is checked only for a Portfolio Event.
		const completeness = eventCompleteness(eventWarnings({}));
		expect(completeness.complete).toBe(1);
		expect(completeness.total).toBe(5);
	});

	it('is 5/5 for a complete Event', () => {
		expect(eventCompleteness(eventWarnings(COMPLETE))).toMatchObject({ complete: 5, total: 5 });
	});

	it('checks Portfolio for a Portfolio Event', () => {
		const warnings = [...eventWarnings(COMPLETE), ...portfolioWarnings({})];
		expect(eventCompleteness(warnings, { isPortfolio: true })).toMatchObject({ complete: 5, total: 6 });
	});

	it('groups the Portfolio list under the Portfolio tab', () => {
		const portfolio = eventCompleteness(portfolioWarnings({})).tabs.find(
			(tab) => tab.tab === 'portfolio'
		);
		expect(portfolio?.warnings.map((warning) => warning.code)).toEqual([
			'missing-recap-fr',
			'missing-recap-en',
			'no-event-photo',
		]);
	});
});

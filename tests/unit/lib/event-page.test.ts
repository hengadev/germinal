import { describe, it, expect } from 'vitest';
import {
	creditsOf,
	eventPage,
	formatPrice,
	paragraphsOf,
	priceLineOf,
	seatingStateOf,
	type PageDay,
	type PageSeating,
	type Translate,
} from '../../../src/lib/utils/event-page';

/** The key, with its values when it has any: what the page would translate.
 * Intl's no-break spaces read as plain ones. */
const t: Translate = (id, options) => (options?.values ? `${id} ${JSON.stringify(options.values)}` : id).replace(/[\u00A0\u202F]/g, ' ');
const plain = (text: string) => text.replace(/[\u00A0\u202F]/g, ' ');

function seating(overrides: Partial<PageSeating> = {}): PageSeating {
	return {
		id: 's1',
		startTime: '2027-03-12T19:00:00.000Z',
		endTime: '2027-03-12T22:00:00.000Z',
		priceAmount: 8500,
		currency: 'EUR',
		availableCapacity: 20,
		totalCapacity: 24,
		allowWaitlist: false,
		soldOut: false,
		isPast: false,
		badgeType: 'none',
		bookingRefusal: null,
		...overrides,
	};
}

function day(date: string, sessions: PageSeating[], priceAmount: number | null = 8500, menu: PageDay['services'][number]['menu'] = null): PageDay {
	return { date, services: [{ kind: 'dinner', menu, priceAmount, currency: 'EUR', sessions }] };
}

const event = { id: 'e1', timeZone: 'Europe/Paris', titleFr: 'Braises', titleEn: 'Embers', depositType: 'percent', depositValue: 100 };

/** The public Event page: what a visitor can do with each Seating. */
describe('seatingStateOf', () => {
	it('is open with seats to spare, limited with a few left or a Limited badge', () => {
		expect(seatingStateOf(seating())).toBe('open');
		expect(seatingStateOf(seating({ availableCapacity: 3 }))).toBe('limited');
		expect(seatingStateOf(seating({ availableCapacity: 30, totalCapacity: 100 }))).toBe('open');
		expect(seatingStateOf(seating({ availableCapacity: 20, totalCapacity: 100 }))).toBe('limited');
		expect(seatingStateOf(seating({ badgeType: 'limited' }))).toBe('limited');
		// No limit (ADR 0009): never running low.
		expect(seatingStateOf(seating({ availableCapacity: null, totalCapacity: null }))).toBe('open');
	});

	it('offers the Waitlist only when a full Seating has one open', () => {
		expect(seatingStateOf(seating({ soldOut: true, availableCapacity: 0 }))).toBe('full');
		expect(seatingStateOf(seating({ soldOut: true, availableCapacity: 0, allowWaitlist: true }))).toBe('waitlist');
		expect(seatingStateOf(seating({ soldOut: true, availableCapacity: 0, allowWaitlist: true, waitlistOpen: false }))).toBe('full');
	});

	it('follows Event access: not priced, outside the Booking Window, started', () => {
		expect(seatingStateOf(seating({ priceAmount: null }))).toBe('unpriced');
		expect(seatingStateOf(seating({ bookingRefusal: 'not-open' }))).toBe('not-open');
		expect(seatingStateOf(seating({ bookingRefusal: 'closed' }))).toBe('closed');
		expect(seatingStateOf(seating({ bookingRefusal: 'started' }))).toBe('past');
		// Not priced wins over full: no Waitlist before the price is set.
		expect(seatingStateOf(seating({ priceAmount: null, soldOut: true, allowWaitlist: true }))).toBe('unpriced');
	});
});

describe('priceLineOf', () => {
	it('says one price, the lowest of several, free, or to be announced', () => {
		expect(priceLineOf([day('2027-03-12', [seating()])], 'fr', t)).toBe('events.page.price.each {"amount":"85 €"}');
		expect(priceLineOf([day('2027-03-12', [seating()]), day('2027-03-13', [seating()], 4500)], 'en', t)).toBe(
			'events.page.price.from {"amount":"€45"}'
		);
		expect(priceLineOf([day('2027-03-12', [seating()], 0)], 'fr', t)).toBe('events.page.price.freeBooking');
		expect(priceLineOf([day('2027-03-12', [seating()], null)], 'fr', t)).toBe('events.priceToBeAnnounced');
	});
});

describe('eventPage', () => {
	it('lists Seatings in time order, whatever their badge, and marks the VIP one', () => {
		const late = seating({ id: 'late', startTime: '2027-03-12T21:00:00.000Z', badgeType: 'popular' });
		const vip = seating({ id: 'vip', startTime: '2027-03-12T18:00:00.000Z', badgeType: 'vip' });
		const page = eventPage(event, [day('2027-03-12', [late, seating(), vip])], 'fr', t);
		const seatings = page.days[0].services[0].seatings;
		expect(seatings.map((s) => s.id)).toEqual(['vip', 's1', 'late']);
		expect(seatings.map((s) => s.vip)).toEqual([true, false, false]);
		expect(seatings[0].start).toBe('19:00');
	});

	it('sums the Seatings up: open while one can be booked, then the Waitlist, then why not', () => {
		const full = seating({ id: 'full', soldOut: true, availableCapacity: 0 });
		const listed = seating({ id: 'listed', soldOut: true, availableCapacity: 0, allowWaitlist: true });
		expect(eventPage(event, [day('2027-03-12', [seating(), full])], 'fr', t).summary).toBe('open');
		expect(eventPage(event, [day('2027-03-12', [full, listed])], 'fr', t).summary).toBe('waitlist');
		expect(eventPage(event, [day('2027-03-12', [full])], 'fr', t).summary).toBe('full');
		expect(eventPage(event, [day('2027-03-12', [seating({ isPast: true })])], 'fr', t).summary).toBe('past');
		const notOpen = eventPage(event, [day('2027-03-12', [seating({ bookingRefusal: 'not-open', bookingOpensAt: '2027-03-01T09:00:00.000Z' })])], 'fr', t);
		expect(notOpen.summary).toBe('not-open');
		expect(notOpen.summaryLabel).toBe('booking.bookingOpensOn {"date":"lundi 1 mars 2027 à 10:00"}');
	});

	it('shows a Menu served at several Services once, saying where', () => {
		const course = (dishFr: string) => ({ labelFr: '', labelEn: '', dishFr, dishEn: '' });
		const menu = {
			nameFr: 'Feu de bois',
			nameEn: 'Wood fire',
			courses: [course('Huîtres'), course('Agneau'), course('Poire')],
			descriptionFr: 'Accord mets et vins en option',
			descriptionEn: null,
		};
		const page = eventPage(event, [day('2027-03-12', [seating()], 8500, menu), day('2027-03-13', [seating({ id: 's2' })], 8500, menu)], 'fr', t);
		expect(page.menus).toHaveLength(1);
		expect(page.menus[0].courses.map((c) => c.dish)).toEqual(['Huîtres', 'Agneau', 'Poire']);
		expect(page.menus[0].note).toBe('Accord mets et vins en option');
		expect(page.menus[0].services).toHaveLength(2);
	});

	it('says what is paid online when a Deposit is taken', () => {
		const withDeposit = { ...event, depositType: 'percent', depositValue: 30 };
		const page = eventPage(withDeposit, [day('2027-03-12', [seating()])], 'fr', t);
		expect(page.days[0].services[0].depositNote).toMatch(/^events\.depositPerGuest \{"amount":"25,50 €"\}$/);
		expect(page.conditions[0]).toBe(page.days[0].services[0].depositNote);
	});
});

describe('page text', () => {
	it('splits paragraphs on blank lines', () => {
		expect(paragraphsOf('Un.\n\n  Deux.\n\n\n')).toEqual(['Un.', 'Deux.']);
	});

	it('links a Collaborator who is a Talent and leaves out nameless ones', () => {
		expect(creditsOf(JSON.stringify([{ name: 'Léa', role: 'Cheffe', talentId: 't1' }, { name: ' ' }, { name: 'Max' }]))).toEqual([
			{ name: 'Léa', role: 'Cheffe', href: '/talents/t1' },
			{ name: 'Max', role: '', href: null },
		]);
		expect(creditsOf('not json')).toEqual([]);
	});

	it('drops the cents of a whole price', () => {
		expect(plain(formatPrice(8500, 'EUR', 'fr'))).toBe('85 €');
		expect(formatPrice(8550, 'EUR', 'en')).toBe('€85.50');
	});
});

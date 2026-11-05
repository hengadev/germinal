import { describe, it, expect } from 'vitest';
import { eventPage, type PageDay, type PageSeating, type Translate } from '../../../src/lib/utils/event-page';
import {
	bill,
	dayFits,
	firstFit,
	fits,
	menuFor,
	serviceFits,
	type BookingExtra,
} from '../../../src/lib/utils/inline-booking';

/** The key, with its values when it has any: what the page would translate. */
const t: Translate = (id, options) => (options?.values ? `${id} ${JSON.stringify(options.values)}` : id);

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

const menu = { nameFr: 'Menu du foyer', nameEn: 'Hearth menu', courses: [], descriptionEn: null, descriptionFr: null };

/** Two days, a lunch and a dinner with different Menus on the second. */
const schedule: PageDay[] = [
	{ date: '2027-03-12', services: [{ kind: 'dinner', menu, priceAmount: 8500, currency: 'EUR', sessions: [seating({ id: 'd1-19' })] }] },
	{
		date: '2027-03-13',
		services: [
			{ kind: 'lunch', menu: { ...menu, nameFr: 'Déjeuner', nameEn: 'Lunch' }, priceAmount: 4500, currency: 'EUR', sessions: [seating({ id: 'd2-12', startTime: '2027-03-13T12:00:00.000Z', endTime: '2027-03-13T15:00:00.000Z' })] },
			{ kind: 'dinner', menu: { ...menu, nameFr: 'Dîner de gala', nameEn: 'Gala dinner' }, priceAmount: 9500, currency: 'EUR', sessions: [seating({ id: 'd2-19' })] },
		],
	},
];

const event = {
	id: 'e1',
	timeZone: 'Europe/Paris',
	titleFr: 'Braises',
	titleEn: 'Embers',
	depositType: 'percent',
	depositValue: 100,
	coverShowsTitle: false,
};
const view = eventPage(event, schedule, 'fr', t);
const day = (date: string) => view.days.find((d) => d.date === date)!;
const dinner = view.days[0].services[0];
const seatingView = dinner.seatings[0];

describe('fits / serviceFits / dayFits / firstFit', () => {
	it('takes a party the Seating has room for, or whose Waitlist it can join', () => {
		expect(fits(seatingView, 4)).toBe(true);
		expect(fits(seatingView, 20)).toBe(true);
		expect(fits(seatingView, 21)).toBe(false);
		const waitlist = eventPage(
			event,
			[{ date: '2027-03-12', services: [{ kind: 'dinner', menu, priceAmount: 8500, currency: 'EUR', sessions: [seating({ id: 'w1', availableCapacity: 0, soldOut: true, allowWaitlist: true })] }] }],
			'fr',
			t
		).days[0].services[0].seatings[0];
		expect(waitlist.state).toBe('waitlist');
		expect(fits(waitlist, 2)).toBe(true);
	});

	it('says whether a Service or a Day can still take the party', () => {
		expect(serviceFits(dinner, 2)).toBe(true);
		expect(dayFits(day('2027-03-13'), 2)).toBe(true);
	});

	it('finds the first time of a Service the party can take', () => {
		expect(firstFit(dinner, 2)?.id).toBe('d1-19');
		expect(firstFit(undefined, 2)).toBeUndefined();
	});
});

describe('bill', () => {
	it('counts one line for the meal, the total and the deposit', () => {
		const b = bill(view, { guests: 2, seating: seatingView, service: dinner, extras: {} }, [], menu.nameFr);
		expect(b.lines).toEqual([{ label: '2 × Menu du foyer', amount: 17000 }]);
		expect(b.price.total).toBe(17000);
		expect(b.price.deposit).toBe(17000);
		expect(b.money(b.price.total).replace(/[\u00A0\u202F]/g, ' ')).toBe('170 €');
	});

	it('adds a per-person Extra for the whole table and a counted per-unit one', () => {
		const extras: BookingExtra[] = [
			{ id: 'x-wine', name: 'Accord mets et vins', description: '', priceAmount: 4500, unit: 'per_person' },
			{ id: 'x-bread', name: 'Une miche du foyer', description: '', priceAmount: 900, unit: 'per_unit' },
		];
		const choice = { guests: 2, seating: seatingView, service: dinner, extras: { 'x-wine': 1, 'x-bread': 2 } };
		const b = bill(view, choice, extras, menu.nameFr);
		expect(b.lines).toEqual([
			{ label: '2 × Menu du foyer', amount: 17000 },
			{ label: 'Accord mets et vins × 2', amount: 9000 },
			{ label: 'Une miche du foyer × 2', amount: 1800 },
		]);
		expect(b.price.total).toBe(27800);
	});

	it('bills a VIP Seating at its own price', () => {
		const vip = eventPage(event, [
			{
				date: '2027-03-12',
				services: [{ kind: 'dinner', menu, priceAmount: 15000, currency: 'EUR', sessions: [seating({ id: 'vip-19', badgeType: 'vip', priceAmount: 15000 })] }],
			},
		], 'fr', t).days[0].services[0].seatings[0];
		expect(vip.vip).toBe(true);
		const b = bill(view, { guests: 2, seating: vip, service: dinner, extras: {} }, [], menu.nameFr);
		expect(b.lines).toEqual([{ label: '2 × Menu du foyer', amount: 30000 }]);
		expect(b.price.total).toBe(30000);
	});
});

describe('menuFor', () => {
	it('finds the Menu of the day and meal picked, in the page’s language', () => {
		expect(menuFor(view, schedule, view.menus, '2027-03-12', 'dinner')?.name).toBe('Menu du foyer');
		expect(menuFor(view, schedule, view.menus, '2027-03-13', 'lunch')?.name).toBe('Déjeuner');
		expect(menuFor(view, schedule, view.menus, '2027-03-13', 'dinner')?.name).toBe('Dîner de gala');
		expect(menuFor(view, schedule, view.menus, '2027-03-14', 'dinner')).toBeUndefined();
	});
});

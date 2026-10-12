// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventMenus, eventServices, eventSessions } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
} from '../fixtures/database';
import type { PricingPayload } from '../../src/lib/types/pricing-editor';

// ---------------------------------------------------------------------------
// « Menus & tarifs » (issue 022): Menus described once per Event, attached
// to Services with a price per Service, and the price public pages show.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

afterAll(async () => {
	await closeTestDatabase();
});

async function seedEvent(slug: string) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Pricing Event',
			titleFr: 'Événement Tarifs',
			slug: `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-01-01T00:00:00Z'),
			endDate: new Date('2099-12-31T23:59:59Z'),
			locationEn: 'Paris',
			locationFr: 'Paris',
			venueCapacity: 20,
			published: true,
		})
		.returning();
	return event;
}

/** A Seating on a fresh unpriced Service; returns both ids. */
async function seedSeating(eventId: string, start: string, overrides: Partial<typeof eventSessions.$inferInsert> = {}) {
	const startTime = new Date(start);
	const endTime = new Date(startTime.getTime() + 2 * 3600 * 1000);
	const serviceId = await seedServiceForSession(testDb, eventId, startTime, endTime, { priceAmount: null });
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
			serviceId,
			startTime,
			endTime,
			totalCapacity: 20,
			availableCapacity: 20,
			published: true,
			...overrides,
		})
		.returning();
	return { serviceId, seatingId: seating.id as string };
}

const TASTING = {
	key: 'new-tasting',
	id: null,
	nameEn: 'Tasting menu',
	nameFr: 'Menu dégustation',
	descriptionEn: 'Seven courses',
	descriptionFr: 'Sept services',
};

describe('savePricing', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('creates a Menu and offers it on lunch and dinner at different prices', async () => {
		const event = await seedEvent('menus');
		const lunch = await seedSeating(event.id, '2099-06-10T12:00:00Z');
		const dinner = await seedSeating(event.id, '2099-06-10T19:30:00Z');
		const { savePricing, loadPricingEditor, getServiceOffersByEventId, getSeatingPrice } = await import(
			'../../src/lib/server/services/service-pricing'
		);

		await savePricing(event.id, {
			menus: [TASTING],
			services: [
				{ serviceId: lunch.serviceId, menuKey: 'new-tasting', priceAmount: 4500, currency: 'EUR', clearLegacyPrices: false },
				{ serviceId: dinner.serviceId, menuKey: 'new-tasting', priceAmount: 8500, currency: 'EUR', clearLegacyPrices: false },
			],
		});

		const editor = await loadPricingEditor(event.id);
		expect(editor.menus).toHaveLength(1);
		const menuId = editor.menus[0].id;
		expect(editor.menus[0]).toMatchObject({ nameEn: 'Tasting menu', nameFr: 'Menu dégustation', descriptionFr: 'Sept services' });
		expect(editor.services.map((service) => [service.kind, service.menuId, service.priceAmount])).toEqual([
			['lunch', menuId, 4500],
			['dinner', menuId, 8500],
		]);

		const offers = await getServiceOffersByEventId(event.id);
		expect(offers.get(lunch.serviceId)).toMatchObject({ menu: { nameFr: 'Menu dégustation' }, priceAmount: 4500 });
		expect(offers.get(dinner.serviceId)).toMatchObject({ menu: { nameFr: 'Menu dégustation' }, priceAmount: 8500 });

		// Each Seating is now booked at its own Service's price.
		expect(await getSeatingPrice(testDb, lunch.seatingId)).toEqual({ amount: 4500, currency: 'EUR', legacy: false });
		expect(await getSeatingPrice(testDb, dinner.seatingId)).toEqual({ amount: 8500, currency: 'EUR', legacy: false });
	});

	it('saves a zero price and a Service without a Menu', async () => {
		const event = await seedEvent('free');
		const lunch = await seedSeating(event.id, '2099-06-11T12:00:00Z');
		const { savePricing, getSeatingPrice } = await import('../../src/lib/server/services/service-pricing');

		await savePricing(event.id, {
			menus: [],
			services: [{ serviceId: lunch.serviceId, menuKey: null, priceAmount: 0, currency: 'EUR', clearLegacyPrices: false }],
		});

		expect(await getSeatingPrice(testDb, lunch.seatingId)).toEqual({ amount: 0, currency: 'EUR', legacy: false });
	});

	it('updates and deletes Menus, refusing to delete one still offered and writing nothing', async () => {
		const event = await seedEvent('menu-delete');
		const lunch = await seedSeating(event.id, '2099-06-12T12:00:00Z');
		const { savePricing, loadPricingEditor, MenuInUseError } = await import('../../src/lib/server/services/service-pricing');

		await savePricing(event.id, {
			menus: [TASTING],
			services: [{ serviceId: lunch.serviceId, menuKey: 'new-tasting', priceAmount: 3000, currency: 'EUR', clearLegacyPrices: false }],
		});
		const [menu] = (await loadPricingEditor(event.id)).menus;

		// Dropping the Menu while the Service (left out of the payload) still
		// offers it is refused; the new Menu of the same save is not created.
		const refused: PricingPayload = {
			menus: [{ ...TASTING, key: 'new-other', nameFr: 'Autre' }],
			services: [],
		};
		await expect(savePricing(event.id, refused)).rejects.toBeInstanceOf(MenuInUseError);
		await expect(savePricing(event.id, refused)).rejects.toThrow(/Menu dégustation/);
		const unchanged = await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, event.id));
		expect(unchanged.map((row: { id: string }) => row.id)).toEqual([menu.id]);

		// Renaming, then detaching and deleting in one save, works.
		await savePricing(event.id, {
			menus: [{ ...TASTING, key: menu.id, id: menu.id, nameFr: 'Menu du marché' }],
			services: [],
		});
		expect((await loadPricingEditor(event.id)).menus[0].nameFr).toBe('Menu du marché');

		await savePricing(event.id, {
			menus: [],
			services: [{ serviceId: lunch.serviceId, menuKey: null, priceAmount: 3000, currency: 'EUR', clearLegacyPrices: false }],
		});
		expect(await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, event.id))).toHaveLength(0);
	});

	it('refuses a Service or Menu of another Event', async () => {
		const event = await seedEvent('mine');
		const other = await seedEvent('theirs');
		const theirs = await seedSeating(other.id, '2099-06-13T12:00:00Z');
		const { savePricing, UnknownPricingTargetError, loadPricingEditor } = await import(
			'../../src/lib/server/services/service-pricing'
		);

		await expect(savePricing(event.id, {
			menus: [],
			services: [{ serviceId: theirs.serviceId, menuKey: null, priceAmount: 100, currency: 'EUR', clearLegacyPrices: false }],
		})).rejects.toBeInstanceOf(UnknownPricingTargetError);

		await savePricing(other.id, { menus: [TASTING], services: [] });
		const [theirMenu] = (await loadPricingEditor(other.id)).menus;
		await expect(savePricing(event.id, {
			menus: [{ ...TASTING, key: theirMenu.id, id: theirMenu.id }],
			services: [],
		})).rejects.toBeInstanceOf(UnknownPricingTargetError);

		const [service] = await testDb.select().from(eventServices).where(eq(eventServices.id, theirs.serviceId));
		expect(service.priceAmount).toBeNull();
	});

	it('lists Seatings that kept a legacy price and aligns them on the Service price on request', async () => {
		const event = await seedEvent('legacy');
		const first = await seedSeating(event.id, '2099-06-14T19:00:00Z');
		const [second] = await testDb
			.insert(eventSessions)
			.values({
				eventId: event.id,
				serviceId: first.serviceId,
				startTime: new Date('2099-06-14T21:30:00Z'),
				endTime: new Date('2099-06-14T23:30:00Z'),
				totalCapacity: 20,
				availableCapacity: 20,
				published: true,
				legacyPriceAmount: 6000,
				legacyCurrency: 'EUR',
			})
			.returning();
		const { savePricing, loadPricingEditor, getSeatingPrice } = await import('../../src/lib/server/services/service-pricing');

		const payload = (clearLegacyPrices: boolean): PricingPayload => ({
			menus: [],
			services: [{ serviceId: first.serviceId, menuKey: null, priceAmount: 4500, currency: 'EUR', clearLegacyPrices }],
		});

		await savePricing(event.id, payload(false));
		const [service] = (await loadPricingEditor(event.id)).services;
		expect(service.legacySeatings).toEqual([
			{ seatingId: second.id, start: '21:30', priceAmount: 6000, currency: 'EUR' },
		]);
		expect(await getSeatingPrice(testDb, second.id)).toEqual({ amount: 6000, currency: 'EUR', legacy: true });

		await savePricing(event.id, payload(true));
		expect((await loadPricingEditor(event.id)).services[0].legacySeatings).toEqual([]);
		expect(await getSeatingPrice(testDb, second.id)).toEqual({ amount: 4500, currency: 'EUR', legacy: false });
	});

	it('gives the public schedule each Seating’s Service price', async () => {
		const event = await seedEvent('public');
		const dinner = await seedSeating(event.id, '2099-06-15T19:00:00Z');
		const { savePricing } = await import('../../src/lib/server/services/service-pricing');
		const { getPublishedScheduleByEventId } = await import('../../src/lib/server/services/event-schedule');

		let [row] = await getPublishedScheduleByEventId(event.id);
		expect(row.item.price).toBeNull();

		await savePricing(event.id, {
			menus: [],
			services: [{ serviceId: dinner.serviceId, menuKey: null, priceAmount: 7000, currency: 'GBP', clearLegacyPrices: false }],
		});
		[row] = await getPublishedScheduleByEventId(event.id);
		expect(row.item.price).toEqual({ amount: 7000, currency: 'GBP', legacy: false });
	});
});

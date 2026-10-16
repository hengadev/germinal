// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	events,
	eventDays,
	eventMenus,
	eventServices,
	eventSessions,
} from '../../src/lib/server/db/schema';
import { getTestDatabase, setupTestDatabase, closeTestDatabase } from '../fixtures/database';

// ---------------------------------------------------------------------------
// The new-event form saves everything in one submit: the Event, its Days
// and meals, the Seatings and « Menus & tarifs » — the last two posted for
// Services that do not exist yet, named by placeholder ids.
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

const LUNCH_REF = '11111111-1111-4111-8111-111111111111';
const DINNER_REF = '22222222-2222-4222-8222-222222222222';
const admin = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@test', role: 'admin', createdAt: new Date() };

function seating(start: string) {
	return {
		id: null,
		start,
		end: null,
		titleEn: null,
		titleFr: null,
		descriptionEn: null,
		descriptionFr: null,
		capacityOverride: null,
		published: true,
		allowWaitlist: false,
		badgeType: 'none',
	};
}

function createForm(slug: string, dinnerStart = '19:30'): FormData {
	const form = new FormData();
	const fields: Record<string, string> = {
		titleEn: 'Harvest Dinner',
		titleFr: 'Dîner des Moissons',
		slug,
		descriptionEn: 'A dinner.',
		descriptionFr: 'Un dîner.',
		locationEn: 'Paris',
		locationFr: 'Paris',
		venueCapacity: '24',
		days: JSON.stringify([{ date: '2099-11-14', kinds: ['lunch', 'dinner'] }]),
		serviceRefs: JSON.stringify([
			{ ref: LUNCH_REF, date: '2099-11-14', kind: 'lunch' },
			{ ref: DINNER_REF, date: '2099-11-14', kind: 'dinner' },
		]),
		services: JSON.stringify([
			{ serviceId: LUNCH_REF, defaultDurationMinutes: 90, seatings: [] },
			{ serviceId: DINNER_REF, defaultDurationMinutes: 120, seatings: [seating(dinnerStart), seating('21:30')] },
		]),
		pricing: JSON.stringify({
			menus: [{ key: 'new-1', id: null, nameEn: 'Tasting', nameFr: 'Dégustation', descriptionEn: null, descriptionFr: null }],
			services: [
				{ serviceId: LUNCH_REF, menuKey: null, priceAmount: null, currency: 'EUR', clearLegacyPrices: false },
				{ serviceId: DINNER_REF, menuKey: 'new-1', priceAmount: 8500, currency: 'EUR', clearLegacyPrices: false },
			],
			deposit: { type: 'percent', value: 30 },
			refundPolicy: { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 48, percent: 100 }] },
		}),
	};
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return form;
}

async function submit(form: FormData) {
	const { actions } = await import('../../src/routes/(admin)/admin/events/new/+page.server');
	return actions.default!({
		locals: { user: admin },
		request: new Request('http://x/admin/events/new', { method: 'POST', body: form }),
		params: {},
		url: new URL('http://x/admin/events/new'),
	} as never);
}

describe('creating an Event with its Seatings and pricing', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('saves the Days, Seatings, Menu, price, Deposit and Refund Policy in one submit', async () => {
		const result = await submit(createForm('harvest-dinner'));
		expect(result).toMatchObject({ success: expect.stringContaining('créé') });

		const [event] = await testDb.select().from(events).where(eq(events.slug, 'harvest-dinner'));
		expect(event).toMatchObject({
			venueCapacity: 24,
			depositType: 'percent',
			depositValue: 30,
			refundPolicyType: 'rules',
			refundPolicyTiers: [{ hoursBefore: 48, percent: 100 }],
		});

		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days).toHaveLength(1);
		const services = await testDb.select().from(eventServices).where(eq(eventServices.dayId, days[0].id));
		const lunch = services.find((service) => service.kind === 'lunch')!;
		const dinner = services.find((service) => service.kind === 'dinner')!;
		const [menu] = await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, event.id));
		expect(menu.nameFr).toBe('Dégustation');
		expect(dinner).toMatchObject({ menuId: menu.id, priceAmount: 8500, currency: 'EUR', defaultSeatingDurationMinutes: 120 });
		expect(lunch).toMatchObject({ menuId: null, priceAmount: null });

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(seatings).toHaveLength(2);
		for (const row of seatings) {
			expect(row.serviceId).toBe(dinner.id);
			expect(row.totalCapacity).toBe(24);
			expect(row.availableCapacity).toBe(24);
		}
		expect(seatings.map((row) => row.startTime.toISOString()).sort()).toEqual([
			'2099-11-14T19:30:00.000Z',
			'2099-11-14T21:30:00.000Z',
		]);
	});

	it('creates nothing when a Seating is refused', async () => {
		// A dinner Seating starting at lunch time is refused by the save.
		const result = await submit(createForm('refused-dinner', '12:00'));
		expect(result).toMatchObject({
			status: 400,
			data: { error: expect.stringContaining('ne correspond pas à son repas') },
		});

		expect(await testDb.select().from(events).where(eq(events.slug, 'refused-dinner'))).toHaveLength(0);
		expect(await testDb.select().from(eventDays)).toHaveLength(0);
		expect(await testDb.select().from(eventMenus)).toHaveLength(0);
	});

	it('refuses a placeholder that names no picked meal, before creating anything', async () => {
		const form = createForm('stray-ref');
		form.set('serviceRefs', JSON.stringify([{ ref: DINNER_REF, date: '2099-11-15', kind: 'dinner' }]));
		const result = await submit(form);
		expect(result).toMatchObject({ status: 400 });
		expect(await testDb.select().from(events)).toHaveLength(0);
	});
});

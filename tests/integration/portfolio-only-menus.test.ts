// @vitest-environment node
/**
 * Issue 082 — a Portfolio-only Event's « Menus » tab saves the Menus and
 * each Service's Menu only: prices, currency, Deposit, Refund Policy and
 * extras stay exactly as stored, whatever the form posts. Other Events'
 * saves behave as before.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, eventMenus, eventServices, eventExtras } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendWaitlistNotificationSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout_session',
		url: 'https://checkout.stripe.test/mock',
	}),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/ticket-notifications', () => ({
	sendTicketNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/csrf', () => ({
	validateCsrfToken: () => true,
}));

vi.mock('../../src/lib/server/rate-limit', () => ({
	checkRateLimit: vi.fn().mockResolvedValue({ status: 'allowed' }),
}));

vi.mock('../../src/lib/mock-data', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/mock-data')>()),
	USE_MOCK_DATA: false,
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
		RESERVATION_EXPIRY_MINUTES: 15,
		STRIPE_SECRET_KEY: 'sk_test_fake',
		STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
	},
	config: { reservations: { maxTicketsPerReservation: 10 } },
	isStripeEnabled: () => true,
	isAWSConfigured: () => false,
	isBrevoConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/services/s3', () => ({
	deleteFromS3: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

afterAll(async () => {
	await closeTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const admin = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@test', role: 'admin', createdAt: new Date() };

/** An Event with one Seating — past (`seedPast`) or future — and stored
 * pricing: a Menu offered on the dinner Service at 45 EUR, a 20 % Deposit,
 * a no-refund policy and one extra. */
async function seedPricedEvent(seedPast: boolean) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'The Long Table',
			titleFr: 'La longue table',
			descriptionEn: 'An announcement.',
			descriptionFr: 'Une annonce.',
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			timeZone: 'Europe/Paris',
			depositType: 'percent',
			depositValue: 20,
			refundPolicyType: 'manual',
		})
		.returning();
	const when = seedPast ? new Date('2025-03-12T19:00:00Z') : new Date('2099-11-14T19:00:00Z');
	const serviceId = await seedServiceForSession(testDb, event.id, when, new Date(when.getTime() + 3 * 3600 * 1000));
	await testDb.insert(eventSessions).values({
		eventId: event.id,
		serviceId,
		titleEn: 'Dinner',
		titleFr: 'Dîner',
		startTime: when,
		endTime: new Date(when.getTime() + 3 * 3600 * 1000),
		totalCapacity: 10,
		availableCapacity: 10,
		published: true,
		allowWaitlist: true,
	});
	const [menu] = await testDb
		.insert(eventMenus)
		.values({ eventId: event.id, nameFr: 'Dégustation', nameEn: 'Tasting' })
		.returning();
	await testDb.update(eventServices).set({ menuId: menu.id, priceAmount: 4500 }).where(eq(eventServices.id, serviceId));
	const [extra] = await testDb
		.insert(eventExtras)
		.values({ eventId: event.id, nameFr: 'Verre de vin', nameEn: 'Wine glass', priceAmount: 900, unit: 'per_person' })
		.returning();
	return { eventId: event.id, serviceId, menuId: menu.id, extraId: extra.id };
}

async function savePricing(eventId: string, form: FormData) {
	const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
	return actions.savePricing!({
		locals: { user: admin },
		request: new Request(`http://x/admin/events/${eventId}?/savePricing`, { method: 'POST', body: form }),
		params: { id: eventId },
		url: new URL(`http://x/admin/events/${eventId}?/savePricing`),
	} as never);
}

/** A « Menus » tab's post: a new Menu on the Service, and — posted all the
 * same — a rogue price, currency, Deposit, Refund Policy and an empty
 * extras list (which would delete the stored extra). */
function menusForm(serviceId: string, storedMenuId: string): FormData {
	const form = new FormData();
	form.set('pricing', JSON.stringify({
		menus: [
			{ key: 'stored', id: storedMenuId, nameEn: 'Tasting', nameFr: 'Dégustation', descriptionEn: null, descriptionFr: null },
			{ key: 'new-1', id: null, nameEn: 'Market', nameFr: 'Marché', descriptionEn: null, descriptionFr: null },
		],
		services: [{ serviceId, menuKey: 'new-1', priceAmount: 9900, clearLegacyPrices: true }],
		currency: 'CHF',
		deposit: { type: 'fixed', value: 3000 },
		refundPolicy: { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 24, percent: 50 }] },
	}));
	form.set('extras', JSON.stringify({ extras: [] }));
	return form;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the « Menus » tab save on a Portfolio-only Event (issue 082)', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('stores the Menus and the Service Menu, leaving prices, currency, Deposit, refund and extras as stored', async () => {
		const { eventId, serviceId, menuId } = await seedPricedEvent(true);
		expect(await savePricing(eventId, menusForm(serviceId, menuId))).toMatchObject({ success: expect.any(String) });

		const [event] = await testDb.select().from(events).where(eq(events.id, eventId));
		expect(event.currency).toBe('EUR');
		expect(event.depositType).toBe('percent');
		expect(event.depositValue).toBe(20);
		expect(event.refundPolicyType).toBe('manual');
		expect(event.refundPolicyTiers).toEqual([{ hoursBefore: 24, percent: 100 }]);

		const menus = await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, eventId));
		expect(menus.map((menu) => menu.nameFr).sort()).toEqual(['Dégustation', 'Marché']);
		const [service] = await testDb.select().from(eventServices).where(eq(eventServices.id, serviceId));
		expect(service.menuId).toBe(menus.find((menu) => menu.nameFr === 'Marché')!.id);
		expect(service.priceAmount).toBe(4500);

		const extras = await testDb.select().from(eventExtras).where(eq(eventExtras.eventId, eventId));
		expect(extras).toHaveLength(1);
	});

	it('keeps the full « Menus & tarifs » save on another Event', async () => {
		const { eventId, serviceId, menuId } = await seedPricedEvent(false);
		expect(await savePricing(eventId, menusForm(serviceId, menuId))).toMatchObject({ success: expect.any(String) });

		const [event] = await testDb.select().from(events).where(eq(events.id, eventId));
		expect(event.currency).toBe('CHF');
		expect(event.depositType).toBe('fixed');
		expect(event.depositValue).toBe(3000);
		expect(event.refundPolicyTiers).toEqual([{ hoursBefore: 24, percent: 50 }]);

		const [service] = await testDb.select().from(eventServices).where(eq(eventServices.id, serviceId));
		expect(service.priceAmount).toBe(9900);
		const extras = await testDb.select().from(eventExtras).where(eq(eventExtras.eventId, eventId));
		expect(extras).toHaveLength(0);
	});
});

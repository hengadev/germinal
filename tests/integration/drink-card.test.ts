// @vitest-environment node
/**
 * Issue 086 — an Event's Drinks card: saved with the Menus tab (emptied,
 * reloaded), and returned by the announcement and project page loads.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks (copied from project-preview.test.ts)
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

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

afterAll(async () => {
	await closeTestDatabase();
});

const ANONYMOUS_LOCALS = { user: null, csrfToken: 'token' };

const CARD = {
	sections: [
		{
			labelEn: 'Cocktails',
			labelFr: 'Cocktails',
			drinks: [
				{ nameEn: 'Spritz', nameFr: 'Spritz', descriptionEn: null, descriptionFr: 'Apérol, prosecco', priceAmount: 1200 },
				{ nameEn: 'Lemonade', nameFr: 'Citronnade', descriptionEn: null, descriptionFr: null, priceAmount: null },
			],
		},
	],
	noteEn: null,
	noteFr: 'Réglées sur place',
};

async function seedEvent(overrides: Partial<typeof events.$inferInsert> = {}) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Drinks Event',
			titleFr: 'Événement boissons',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			timeZone: 'Europe/Paris',
			...overrides,
		})
		.returning();
	return event;
}

async function loadPage(id: string) {
	const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
	return (await load({ params: { id }, locals: ANONYMOUS_LOCALS, setHeaders: () => {} } as any)) as any;
}

describe('the Drinks card (issue 086)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('saves, reloads, updates and empties the card with the Menus tab', async () => {
		const event = await seedEvent();
		const { savePricing, loadPricingEditor } = await import('../../src/lib/server/services/service-pricing');

		await savePricing(event.id, { menus: [], services: [], drinkCard: CARD });
		expect((await loadPricingEditor(event.id)).drinkCard).toEqual(CARD);

		const updated = { ...CARD, sections: [{ ...CARD.sections[0], drinks: [CARD.sections[0].drinks[1]] }], noteFr: null };
		await savePricing(event.id, { menus: [], services: [], drinkCard: updated });
		expect((await loadPricingEditor(event.id)).drinkCard).toEqual(updated);

		// Absent from the payload (the new-event form): left as stored.
		await savePricing(event.id, { menus: [], services: [] });
		expect((await loadPricingEditor(event.id)).drinkCard).toEqual(updated);

		// No drink left: the row goes.
		await savePricing(event.id, { menus: [], services: [], drinkCard: { sections: [], noteEn: null, noteFr: 'Seule' } });
		expect((await loadPricingEditor(event.id)).drinkCard).toBeNull();
		const rows = await testDb.execute(`SELECT count(*)::int AS n FROM event_drink_cards`);
		expect((rows as any).rows?.[0]?.n ?? (rows as any)[0]?.n).toBe(0);
	});

	it('is deleted with its Event', async () => {
		const event = await seedEvent();
		const { savePricing } = await import('../../src/lib/server/services/service-pricing');
		await savePricing(event.id, { menus: [], services: [], drinkCard: CARD });
		await testDb.delete(events);
		const rows = await testDb.execute(`SELECT count(*)::int AS n FROM event_drink_cards`);
		expect((rows as any).rows?.[0]?.n ?? (rows as any)[0]?.n).toBe(0);
	});

	it('is returned by the announcement load, and none for an Event without one', async () => {
		const event = await seedEvent({ startDate: new Date('2099-06-01T00:00:00Z'), endDate: new Date('2099-06-02T00:00:00Z') });
		await seedServiceForSession(testDb, event.id, new Date('2099-06-01T19:00:00Z'), new Date('2099-06-01T22:00:00Z'));
		expect((await loadPage(event.id)).event.drinkCard).toBeNull();

		const { savePricing } = await import('../../src/lib/server/services/service-pricing');
		await savePricing(event.id, { menus: [], services: [], drinkCard: CARD });
		const data = await loadPage(event.id);
		expect(data.view).not.toMatch(/portfolio/);
		expect(data.event.drinkCard).toEqual(CARD);
	});

	it('is returned by the project page load, with the Event’s currency', async () => {
		const event = await seedEvent({ isPortfolio: true, recapEn: 'Recap', recapFr: 'Récap', currency: 'CHF' });
		await seedServiceForSession(testDb, event.id, new Date('2025-03-12T19:00:00Z'), new Date('2025-03-12T22:00:00Z'));
		expect((await loadPage(event.id)).project.drinkCard).toBeNull();

		const { savePricing } = await import('../../src/lib/server/services/service-pricing');
		await savePricing(event.id, { menus: [], services: [], drinkCard: CARD });
		const data = await loadPage(event.id);
		expect(data.view).toBe('portfolio');
		expect(data.project.drinkCard).toEqual(CARD);
		expect(data.project.currency).toBe('CHF');
	});
});

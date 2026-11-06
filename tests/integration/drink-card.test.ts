// @vitest-environment node
/**
 * Issue 087 — an Event's Drinks cards: several per Event, picked per meal,
 * saved with the Menus tab (created, updated, deleted — a deleted card
 * leaves its meals without one), and returned by the announcement and
 * project page loads.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eventSessions, events } from '../../src/lib/server/db/schema';
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

const CARD = (key: string, id: string | null = null) => ({
	key,
	id,
	nameEn: 'Drinks',
	nameFr: 'Boissons',
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
});

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

describe('the Drinks cards (issue 087)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('saves several cards, offers them per meal and deletes those left out or emptied', async () => {
		const event = await seedEvent();
		const serviceId = await seedServiceForSession(testDb, event.id, new Date('2099-06-01T19:00:00Z'), new Date('2099-06-01T22:00:00Z'));
		const otherServiceId = await seedServiceForSession(testDb, event.id, new Date('2099-06-02T12:00:00Z'), new Date('2099-06-02T15:00:00Z'));
		const { savePricing, loadPricingEditor } = await import('../../src/lib/server/services/service-pricing');

		// Two cards at once, one new (key only) and one picked per meal.
		const first = savePricing(event.id, {
			menus: [],
			drinkCards: [CARD('c1'), { ...CARD('c2'), nameFr: 'Boissons du soir', nameEn: '' }],
			services: [
				{ serviceId, menuKey: null, drinkCardKey: 'c2', priceAmount: 2500, clearLegacyPrices: false },
				{ serviceId: otherServiceId, menuKey: null, drinkCardKey: null, priceAmount: 2500, clearLegacyPrices: false },
			],
		});
		await expect(first).resolves.toMatchObject({ menuIds: {} });

		let editor = await loadPricingEditor(event.id);
		expect(editor.drinkCards).toHaveLength(2);
		const card1 = editor.drinkCards!.find((c) => c.nameFr === 'Boissons')!;
		const card2 = editor.drinkCards!.find((c) => c.nameFr === 'Boissons du soir')!;
		expect(editor.services.find((s) => s.serviceId === serviceId)?.drinkCardId).toBe(card2.id);
		expect(editor.services.find((s) => s.serviceId === otherServiceId)?.drinkCardId).toBeNull();

		// Absent from the payload (the new-event form): left as stored.
		await savePricing(event.id, { menus: [], services: [] });
		expect((await loadPricingEditor(event.id)).drinkCards).toHaveLength(2);

		// A card left out is deleted; the Services that offered it keep
		// none (the link goes, not the Service).
		const { drinkCardIds } = await savePricing(event.id, {
			menus: [],
			drinkCards: [{ ...CARD('c1', card1.id) }],
			services: [
				{ serviceId, menuKey: null, drinkCardKey: 'c1', priceAmount: 2500, clearLegacyPrices: false },
			],
		});
		expect(drinkCardIds).toEqual({ c1: card1.id });
		editor = await loadPricingEditor(event.id);
		expect(editor.drinkCards).toHaveLength(1);
		expect(editor.services.find((s) => s.serviceId === serviceId)?.drinkCardId).toBe(card1.id);

		// A card emptied (no drink) is deleted too, and the Service outside
		// the payload is simply unlinked.
		await savePricing(event.id, {
			menus: [],
			drinkCards: [{ ...CARD('c1', card1.id), sections: [] }],
			services: [],
		});
		editor = await loadPricingEditor(event.id);
		expect(editor.drinkCards).toHaveLength(0);
		expect(editor.services.find((s) => s.serviceId === serviceId)?.drinkCardId).toBeNull();
		const rows = await testDb.execute(`SELECT count(*)::int AS n FROM event_drink_cards`);
		expect((rows as any).rows?.[0]?.n ?? (rows as any)[0]?.n).toBe(0);
	});

	it('refuses a card of another Event', async () => {
		const event = await seedEvent();
		const other = await seedEvent();
		const { savePricing, loadEventDrinkCards } = await import('../../src/lib/server/services/service-pricing');
		await savePricing(other.id, { menus: [], drinkCards: [CARD('c1')], services: [] });
		const [theirCard] = await loadEventDrinkCards(other.id);
		await expect(
			savePricing(event.id, { menus: [], drinkCards: [{ ...CARD('c1', theirCard.id) }], services: [] })
		).rejects.toThrow();
	});

	it('is deleted with its Event', async () => {
		const event = await seedEvent();
		const { savePricing } = await import('../../src/lib/server/services/service-pricing');
		await savePricing(event.id, { menus: [], drinkCards: [CARD('c1')], services: [] });
		await testDb.delete(events);
		const rows = await testDb.execute(`SELECT count(*)::int AS n FROM event_drink_cards`);
		expect((rows as any).rows?.[0]?.n ?? (rows as any)[0]?.n).toBe(0);
	});

	it('is returned by the announcement load with the meal’s Menu, and none for an Event without one', async () => {
		const event = await seedEvent({ startDate: new Date('2099-06-01T00:00:00Z'), endDate: new Date('2099-06-02T00:00:00Z') });
		const serviceId = await seedServiceForSession(testDb, event.id, new Date('2099-06-01T19:00:00Z'), new Date('2099-06-01T22:00:00Z'));
		await testDb.insert(eventSessions).values({
			eventId: event.id,
			serviceId,
			startTime: new Date('2099-06-01T19:00:00Z'),
			endTime: new Date('2099-06-01T22:00:00Z'),
			published: true,
		});
		const empty = await loadPage(event.id);
		expect(empty.view).not.toMatch(/portfolio/);
		expect(empty.schedule[0].services[0].drinks).toBeNull();

		const { savePricing, loadEventDrinkCards } = await import('../../src/lib/server/services/service-pricing');
		await savePricing(event.id, {
			menus: [],
			drinkCards: [CARD('c1')],
			services: [{ serviceId, menuKey: null, drinkCardKey: 'c1', priceAmount: 2500, clearLegacyPrices: false }],
		});
		const [card] = await loadEventDrinkCards(event.id);
		const data = await loadPage(event.id);
		expect(data.view).not.toMatch(/portfolio/);
		expect(data.event.drinkCard).toBeUndefined();
		const service = data.schedule[0].services[0];
		expect(service.drinks).toEqual({
			nameEn: 'Drinks',
			nameFr: 'Boissons',
			sections: CARD('c1').sections,
			noteEn: null,
			noteFr: 'Réglées sur place',
		});
		expect(service.drinks?.sections[0].drinks[0].priceAmount).toBe(1200);
		void card;
	});

	it('is returned by the project page load, distinct and in order, with the Event’s currency', async () => {
		const event = await seedEvent({ isPortfolio: true, recapEn: 'Recap', recapFr: 'Récap', currency: 'CHF' });
		const dinner = await seedServiceForSession(testDb, event.id, new Date('2025-03-12T19:00:00Z'), new Date('2025-03-12T22:00:00Z'));
		const lunch = await seedServiceForSession(testDb, event.id, new Date('2025-03-13T12:00:00Z'), new Date('2025-03-13T15:00:00Z'));
		expect((await loadPage(event.id)).project.drinkCard).toBeUndefined();

		const { savePricing } = await import('../../src/lib/server/services/service-pricing');
		const { drinkCardIds } = await savePricing(event.id, {
			menus: [],
			drinkCards: [CARD('c1'), { ...CARD('c2'), nameFr: 'Boissons du soir' }],
			services: [
				{ serviceId: dinner, menuKey: null, drinkCardKey: 'c2', priceAmount: 2500, clearLegacyPrices: false },
				{ serviceId: lunch, menuKey: null, drinkCardKey: 'c1', priceAmount: 2500, clearLegacyPrices: false },
			],
		});
		const data = await loadPage(event.id);
		expect(data.view).toBe('portfolio');
		const { projectPage } = await import('$lib/utils/event-page');
		const view = projectPage(data.project, 'fr');
		expect(view.drinks.map((card: { name: string }) => card.name)).toEqual(['Boissons du soir', 'Boissons']);
		expect(view.drinks[0].sections[0].drinks[0].price).toMatch(/12/);
		expect(data.project.currency).toBe('CHF');
		expect(drinkCardIds).toBeDefined();
	});
});

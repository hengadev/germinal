// @vitest-environment node
/**
 * Issue 083 — the project page of a Portfolio Event returns its Menus: the
 * distinct Menus its Services offered, as raw rows, with no price.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventMenus } from '../../src/lib/server/db/schema';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANONYMOUS_LOCALS = { user: null, csrfToken: 'token' };

/** A published Portfolio Event with two Services, both offering the same Menu. */
async function seedPortfolioEventWithMenu() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Past Event',
			titleFr: 'Événement passé',
			recapEn: 'The recap.',
			recapFr: 'Le récapitulatif.',
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			isPortfolio: true,
			timeZone: 'Europe/Paris',
		})
		.returning();
	const dinnerService = await seedServiceForSession(
		testDb,
		event.id,
		new Date('2025-03-12T19:00:00Z'),
		new Date('2025-03-12T22:00:00Z')
	);
	const lunchService = await seedServiceForSession(
		testDb,
		event.id,
		new Date('2025-03-13T11:00:00Z'),
		new Date('2025-03-13T14:00:00Z')
	);
	const [menu] = await testDb
		.insert(eventMenus)
		.values({
			eventId: event.id,
			nameEn: 'Spring menu',
			nameFr: 'Menu de printemps',
			courses: [{ labelEn: 'Starter', labelFr: 'Entrée', dishes: [{ en: 'Broth', fr: 'Bouillon' }] }],
			descriptionEn: 'Wine included',
			descriptionFr: 'Vin compris',
		})
		.returning();
	await testDb.execute(
		`UPDATE event_services SET menu_id = '${menu.id}' WHERE id IN ('${dinnerService}', '${lunchService}')`
	);
	return event;
}

async function loadProject(id: string) {
	const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
	const data: any = await load({
		params: { id },
		locals: ANONYMOUS_LOCALS,
		setHeaders: () => {},
	} as any);
	return data;
}

// ---------------------------------------------------------------------------
// The Menus on the project page
// ---------------------------------------------------------------------------

describe('the public Event page of a Portfolio Event (issue 083)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('returns the Event’s distinct Menus as raw rows, with no price', async () => {
		const event = await seedPortfolioEventWithMenu();
		const data = await loadProject(event.id);
		expect(data.view).toBe('portfolio');
		expect(data.project.menuServices).toHaveLength(2);
		expect(data.menus).toBeUndefined();
		expect(data.project.menus).toEqual([
			expect.objectContaining({
				id: data.project.menus[0].id,
				nameFr: 'Menu de printemps',
				descriptionFr: 'Vin compris',
			}),
		]);
		const serialized = JSON.stringify(data.project);
		expect(serialized).not.toContain('priceAmount');
		expect(serialized).not.toContain('price');
	});

	it('returns no Menus when the Event has none', async () => {
		const event = await seedPortfolioEventWithMenu();
		await testDb.execute('UPDATE event_services SET menu_id = NULL');
		await testDb.delete(eventMenus);
		const data = await loadProject(event.id);
		expect(data.project.menus).toEqual([]);
	});
});

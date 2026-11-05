// @vitest-environment node
/**
 * Issue 081 — « Aperçu » opens the project page: an Admin previewing a
 * Portfolio-only Draft (past Seatings, no Reservation) gets its project
 * page, `noindex` and never listed; a non-Admin still gets "not found".
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations } from '../../src/lib/server/db/schema';
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
const ADMIN_LOCALS = {
	user: { id: 'admin-1', email: 'admin@example.com', role: 'admin', createdAt: new Date() },
	csrfToken: 'token',
};

/** A Draft whose only Seating is in the past, without any Reservation. */
async function seedPortfolioOnlyDraft() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Past Draft',
			titleFr: 'Brouillon passé',
			descriptionEn: 'An announcement.',
			descriptionFr: 'Une annonce.',
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'draft',
			timeZone: 'Europe/Paris',
		})
		.returning();
	const startTime = new Date('2025-03-12T19:00:00Z');
	const endTime = new Date('2025-03-12T22:00:00Z');
	const serviceId = await seedServiceForSession(testDb, event.id, startTime, endTime);
	await testDb.insert(eventSessions).values({
		eventId: event.id,
		serviceId,
		titleEn: 'Dinner',
		titleFr: 'Dîner',
		startTime,
		endTime,
		totalCapacity: 10,
		availableCapacity: 10,
		published: true,
		allowWaitlist: true,
	});
	return event;
}

async function loadPage(id: string, locals: typeof ANONYMOUS_LOCALS | typeof ADMIN_LOCALS) {
	const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
	let headers: Record<string, string> = {};
	const data: any = await load({
		params: { id },
		locals,
		setHeaders: (h: Record<string, string>) => {
			headers = { ...headers, ...h };
		},
	} as any);
	return { data, headers };
}

// ---------------------------------------------------------------------------
// The project preview
// ---------------------------------------------------------------------------

describe('the public Event page on a Portfolio-only Draft (issue 081)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('an Admin gets the project data, unindexed and without Seatings', async () => {
		const draft = await seedPortfolioOnlyDraft();
		const { data, headers } = await loadPage(draft.id, ADMIN_LOCALS);
		expect(data.view).toBe('portfolio-preview');
		expect(data.project?.id).toBe(draft.id);
		expect(data.event).toBeNull();
		expect(data.schedule).toEqual([]);
		expect(data.sessions).toEqual([]);
		expect(data.indexed).toBe(false);
		expect(headers['X-Robots-Tag']).toBe('noindex');
	});

	it('a non-Admin is not found', async () => {
		const draft = await seedPortfolioOnlyDraft();
		await expect(loadPage(draft.id, ANONYMOUS_LOCALS)).rejects.toMatchObject({ status: 404 });
	});

	it('a Draft with an upcoming Seating keeps the announcement preview', async () => {
		const draft = await seedPortfolioOnlyDraft();
		const startTime = new Date('2099-06-01T19:00:00Z');
		const endTime = new Date('2099-06-01T22:00:00Z');
		const serviceId = await seedServiceForSession(testDb, draft.id, startTime, endTime);
		await testDb.insert(eventSessions).values({
			eventId: draft.id,
			serviceId,
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startTime,
			endTime,
			totalCapacity: 10,
			availableCapacity: 10,
			published: true,
			allowWaitlist: true,
		});
		const { data } = await loadPage(draft.id, ADMIN_LOCALS);
		expect(data.view).toBe('preview');
		expect(data.project).toBeNull();
	});

	it('a Draft that has taken a Reservation keeps the announcement preview', async () => {
		const draft = await seedPortfolioOnlyDraft();
		const [seating] = await testDb.select().from(eventSessions).limit(1);
		await testDb.insert(reservations).values({
			eventSessionId: seating.id,
			guestName: 'Guest',
			quantity: 1,
			totalAmount: 0,
			depositAmount: 0,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'cancelled',
			isComp: false,
			origin: 'online',
			accessToken: 'atk-project-preview-cancelled',
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
		});
		const { data } = await loadPage(draft.id, ADMIN_LOCALS);
		expect(data.view).toBe('preview');
		expect(data.project).toBeNull();
	});
});

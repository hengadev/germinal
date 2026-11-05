// @vitest-environment node
/**
 * Issue 078 — Portfolio-only Events get a reduced editor. The editor's load
 * reports whether the Event has ever taken a Reservation (any status, a
 * cancelled one included), which — with the last Seating start — is what the
 * shared `isPortfolioOnly` predicate decides on.
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

/** An Event whose only Seating is in the past, without any Reservation. */
async function seedPastEvent() {
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
		})
		.returning();
	const startTime = new Date('2025-03-12T19:00:00Z');
	const endTime = new Date('2025-03-12T22:00:00Z');
	const serviceId = await seedServiceForSession(testDb, event.id, startTime, endTime);
	const [session] = await testDb
		.insert(eventSessions)
		.values({
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
		})
		.returning();
	return { event, sessionId: session.id };
}

async function loadEditor(eventId: string) {
	const { load } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
	return load({ params: { id: eventId } } as never) as Promise<{
		lastSeatingStart: Date | null;
		hasReservations: boolean;
	}>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the Event editor load on a past Event (issue 078)', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('reports a past Event without Reservations as Portfolio-only material', async () => {
		const { event } = await seedPastEvent();
		const data = await loadEditor(event.id);
		expect(data.hasReservations).toBe(false);
		expect(data.lastSeatingStart?.getTime()).toBe(new Date('2025-03-12T19:00:00Z').getTime());
	});

	it('reports the Reservation even when it is cancelled', async () => {
		const { event, sessionId } = await seedPastEvent();
		await testDb.insert(reservations).values({
			eventSessionId: sessionId,
			guestEmail: 'guest@example.com',
			guestName: 'Annulé',
			quantity: 2,
			totalAmount: 0,
			depositAmount: 0,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'cancelled',
			isComp: false,
			origin: 'online',
			accessToken: 'atk-portfolio-only-cancelled',
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
		});
		const data = await loadEditor(event.id);
		expect(data.hasReservations).toBe(true);
	});
});

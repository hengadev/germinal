// @vitest-environment node
/**
 * Issue 071 — « À venir » on the homepage: every Public Event with a
 * published Seating still ahead, soonest first by its next published
 * Seating, without Practical Info. Private and Draft Events never appear;
 * an Event whose Seatings are all past, unpublished ahead, or starting
 * exactly now does not either. The Spotlight is one of them.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

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

const NOW = new Date('2026-11-04T12:00:00Z');

async function seedEvent(
	{ visibility, day, practicalInfoFr = 'Code 4512#' }: {
		visibility: 'draft' | 'private' | 'public';
		day: string;
		practicalInfoFr?: string;
	}
) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: `${visibility} ${day}`,
			titleFr: `${day} ${visibility}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date(`${day}T19:00:00Z`),
			endDate: new Date(`${day}T22:00:00Z`),
			locationEn: 'Venue',
			locationFr: 'Salle',
			visibility,
			practicalInfoFr,
		})
		.returning();
	return event;
}

/** A Seating at `at` (ISO instant), published or not. */
async function seedSeating(eventId: string, at: string, { published = true } = {}) {
	const startTime = new Date(at);
	const endTime = new Date(startTime.getTime() + 3 * 3600_000);
	const serviceId = await seedServiceForSession(testDb, eventId, startTime, endTime);
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
			serviceId,
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startTime,
			endTime,
			totalCapacity: 10,
			availableCapacity: 10,
			published,
			allowWaitlist: true,
		})
		.returning();
	return seating;
}

async function upcoming() {
	const { getUpcomingEvents } = await import('../../src/lib/server/services/events');
	return getUpcomingEvents(NOW);
}

// ---------------------------------------------------------------------------
// « À venir »
// ---------------------------------------------------------------------------

describe('getUpcomingEvents', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('lists Public Events with a published Seating ahead, soonest first, and excludes the rest', async () => {
		const later = await seedEvent({ visibility: 'public', day: '2026-12-20' });
		await seedSeating(later.id, '2026-12-20T19:00:00Z');
		const sooner = await seedEvent({ visibility: 'public', day: '2026-11-10' });
		await seedSeating(sooner.id, '2026-11-10T19:00:00Z');

		// A Private Event ahead never appears.
		const priv = await seedEvent({ visibility: 'private', day: '2026-11-12' });
		await seedSeating(priv.id, '2026-11-12T19:00:00Z');
		// Nor does a Draft one.
		const draft = await seedEvent({ visibility: 'draft', day: '2026-11-13' });
		await seedSeating(draft.id, '2026-11-13T19:00:00Z');
		// An Event whose Seatings are all past.
		const past = await seedEvent({ visibility: 'public', day: '2026-01-10' });
		await seedSeating(past.id, '2026-01-10T19:00:00Z');
		// One whose only Seating ahead is unpublished.
		const unpublished = await seedEvent({ visibility: 'public', day: '2026-11-14' });
		await seedSeating(unpublished.id, '2026-11-14T19:00:00Z', { published: false });
		// One whose Seating starts exactly now.
		const now = await seedEvent({ visibility: 'public', day: '2026-11-04' });
		await seedSeating(now.id, NOW.toISOString());
		// One without any Seating.
		await seedEvent({ visibility: 'public', day: '2026-11-15' });

		expect((await upcoming()).map((e) => e.id)).toEqual([sooner.id, later.id]);
	});

	it('orders an Event with one past and one future Seating by the future one', async () => {
		const mixed = await seedEvent({ visibility: 'public', day: '2026-10-01' });
		await seedSeating(mixed.id, '2026-10-01T19:00:00Z');
		await seedSeating(mixed.id, '2026-12-01T19:00:00Z');
		const before = await seedEvent({ visibility: 'public', day: '2026-11-20' });
		await seedSeating(before.id, '2026-11-20T19:00:00Z');

		expect((await upcoming()).map((e) => e.id)).toEqual([before.id, mixed.id]);
	});

	it('includes the Spotlight like any other upcoming Public Event', async () => {
		const spotlight = await seedEvent({ visibility: 'public', day: '2026-11-10' });
		await seedSeating(spotlight.id, '2026-11-10T19:00:00Z');
		await testDb.update(events).set({ isSpotlight: true }).where(eq(events.id, spotlight.id));

		expect((await upcoming()).map((e) => e.id)).toEqual([spotlight.id]);
	});

	it('carries the published Seatings but no Practical Info', async () => {
		const event = await seedEvent({ visibility: 'public', day: '2026-11-10', practicalInfoFr: 'Code secret 4512#' });
		const published = await seedSeating(event.id, '2026-11-10T19:00:00Z');
		await seedSeating(event.id, '2026-11-11T19:00:00Z', { published: false });

		const [row] = await upcoming();
		expect(row.id).toBe(event.id);
		expect((row as any).practicalInfoFr).toBeUndefined();
		expect(row.eventSessions.map((s: { id: string }) => s.id)).toEqual([published.id]);
	});
});

// @vitest-environment node
/**
 * Issue 044 — "Projets" and the homepage gallery list the Portfolio: Events
 * of any Visibility except Draft, most recent first. An Event joins the
 * Portfolio only once its last Seating has started (the one hard rule, so a
 * Private Event's link is never listed while it can still be booked), and
 * an Event that is over but not in the Portfolio is listed nowhere while
 * its page stays reachable by id.
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

/** An Event that ran on `day`, in the Portfolio or not. */
async function seedEvent(
	{ visibility, day, isPortfolio = false }: {
		visibility: 'draft' | 'private' | 'public';
		day: string;
		isPortfolio?: boolean;
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
			isPortfolio,
		})
		.returning();
	return event;
}

/** A past Seating on `day`, so the Event is over. */
async function seedPastSeating(eventId: string, day: string) {
	const startTime = new Date(`${day}T19:00:00Z`);
	const endTime = new Date(`${day}T22:00:00Z`);
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
			published: true,
			allowWaitlist: true,
		})
		.returning();
	return seating;
}

async function listedIds() {
	const { load } = await import('../../src/routes/(public)/events/+page.server');
	const data: any = await load({ url: new URL('http://x/events'), locals: ANONYMOUS_LOCALS } as any);
	return data.events.map((e: { id: string }) => e.id);
}

// The Portfolio is set through the « Publication » action (issue 012, ADR 0010).
function publicationForm(eventId: string, fields: Record<string, string>) {
	const form = new FormData();
	const defaults = { visibility: 'public', isSpotlight: 'false', isPortfolio: 'false' };
	for (const [key, value] of Object.entries({ ...defaults, ...fields })) form.set(key, value);
	return {
		request: new Request('http://x/admin/events/' + eventId + '?/updatePublication', { method: 'POST', body: form }),
		params: { id: eventId },
		locals: ADMIN_LOCALS,
	} as any;
}

// ---------------------------------------------------------------------------
// "Projets" lists the Portfolio
// ---------------------------------------------------------------------------

describe('"Projets" lists the Portfolio', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('lists Portfolio Events, Private and Public alike, most recent first; an upcoming Event outside the Portfolio and a Draft in it are absent', async () => {
		const older = await seedEvent({ visibility: 'public', day: '2025-01-10', isPortfolio: true });
		const commissioned = await seedEvent({ visibility: 'private', day: '2025-02-01', isPortfolio: true });
		const newer = await seedEvent({ visibility: 'public', day: '2025-03-05', isPortfolio: true });
		await seedEvent({ visibility: 'public', day: '2099-06-01' });
		await seedEvent({ visibility: 'draft', day: '2025-05-01', isPortfolio: true });

		expect(await listedIds()).toEqual([newer.id, commissioned.id, older.id]);
	});

	it('the homepage gallery uses the same set', async () => {
		const older = await seedEvent({ visibility: 'public', day: '2025-01-10', isPortfolio: true });
		const commissioned = await seedEvent({ visibility: 'private', day: '2025-02-01', isPortfolio: true });
		await seedEvent({ visibility: 'public', day: '2099-06-01' });

		const { load } = await import('../../src/routes/(public)/+page.server');
		const data: any = await load({ locals: ANONYMOUS_LOCALS } as any);
		expect(data.events.map((e: { id: string }) => e.id)).toEqual([commissioned.id, older.id]);
		// No Event is the Spotlight: the gallery is all the homepage shows.
		expect(data.spotlightEvent).toBeNull();
	});

	it('a past Public Event not in the Portfolio is listed nowhere, but its page still loads', async () => {
		const past = await seedEvent({ visibility: 'public', day: '2025-01-10' });
		await seedPastSeating(past.id, '2025-01-10');

		expect(await listedIds()).toEqual([]);

		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		const data: any = await load({
			params: { id: past.id },
			locals: ANONYMOUS_LOCALS,
			setHeaders: () => {},
		} as any);
		expect(data.event.id).toBe(past.id);
		expect(data.view).toBe('announcement');
	});

	it('a Private Event in the Portfolio is listed, and its page is reachable by id', async () => {
		const priv = await seedEvent({ visibility: 'private', day: '2025-02-01', isPortfolio: true });
		await seedPastSeating(priv.id, '2025-02-01');

		expect(await listedIds()).toEqual([priv.id]);

		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		const data: any = await load({
			params: { id: priv.id },
			locals: ANONYMOUS_LOCALS,
			setHeaders: () => {},
		} as any);
		// A Portfolio Event's page is its project (issue 045).
		expect(data.view).toBe('portfolio');
		expect(data.project.id).toBe(priv.id);
	});
});

// ---------------------------------------------------------------------------
// Joining the Portfolio
// ---------------------------------------------------------------------------

describe('an Event joins the Portfolio only once its last Seating has started', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	async function isPortfolio(id: string) {
		const [row] = await testDb.select({ isPortfolio: events.isPortfolio }).from(events).where(eq(events.id, id));
		return row.isPortfolio;
	}

	it('is refused while the last Seating is still to come', async () => {
		const event = await seedEvent({ visibility: 'public', day: '2099-06-01' });
		const [seating] = await testDb
			.insert(eventSessions)
			.values({
				eventId: event.id,
				serviceId: await seedServiceForSession(
					testDb,
					event.id,
					new Date('2099-06-01T19:00:00Z'),
					new Date('2099-06-01T22:00:00Z')
				),
				titleEn: 'Dinner',
				titleFr: 'Dîner',
				startTime: new Date('2099-06-01T19:00:00Z'),
				endTime: new Date('2099-06-01T22:00:00Z'),
				totalCapacity: 10,
				availableCapacity: 10,
				published: true,
				allowWaitlist: true,
			})
			.returning();
		expect(seating.startTime.getTime()).toBeGreaterThan(Date.now());

		const { updateEvent, PortfolioRequiresOverEventError } = await import('../../src/lib/server/services/events');
		await expect(updateEvent(event.id, { isPortfolio: true })).rejects.toBeInstanceOf(
			PortfolioRequiresOverEventError
		);
		expect(await isPortfolio(event.id)).toBe(false);
		expect(await listedIds()).toEqual([]);
	});

	it('is refused for an Event without Seatings', async () => {
		const event = await seedEvent({ visibility: 'public', day: '2099-06-01' });
		const { updateEvent, PortfolioRequiresOverEventError } = await import('../../src/lib/server/services/events');
		await expect(updateEvent(event.id, { isPortfolio: true })).rejects.toBeInstanceOf(
			PortfolioRequiresOverEventError
		);
	});

	it('the admin form refuses it too, with the French explanation', async () => {
		const event = await seedEvent({ visibility: 'public', day: '2099-06-01' });
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const result: any = await actions.updatePublication(publicationForm(event.id, { isPortfolio: 'true' }));
		expect(result.status).toBe(400);
		expect(result.data.error).toMatch(/dernière séance commencée/);
		expect(await isPortfolio(event.id)).toBe(false);
	});

	it('is accepted once the last Seating has started, and the Event is then listed', async () => {
		const event = await seedEvent({ visibility: 'public', day: '2025-01-10' });
		// Two Seatings, so the rule really reads the last one.
		await seedPastSeating(event.id, '2025-01-09');
		await seedPastSeating(event.id, '2025-01-10');

		const { updateEvent } = await import('../../src/lib/server/services/events');
		const updated = await updateEvent(event.id, { isPortfolio: true });
		expect(updated.isPortfolio).toBe(true);
		expect(await listedIds()).toEqual([event.id]);
	});

	it('an Event can be taken back out of the Portfolio', async () => {
		const event = await seedEvent({ visibility: 'public', day: '2025-01-10' });
		await seedPastSeating(event.id, '2025-01-10');
		const { updateEvent } = await import('../../src/lib/server/services/events');
		await updateEvent(event.id, { isPortfolio: true });
		await updateEvent(event.id, { isPortfolio: false });
		expect(await isPortfolio(event.id)).toBe(false);
		expect(await listedIds()).toEqual([]);
	});
});

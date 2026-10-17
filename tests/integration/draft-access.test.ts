// @vitest-environment node
/**
 * Issue 030 — a Draft (unpublished Event) is hidden and unbookable through
 * every public entry point, all of which go through Event access.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations, waitlist } from '../../src/lib/server/db/schema';
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

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
const createCheckoutSessionMock = vi.fn().mockResolvedValue({
	id: 'cs_test_mock_checkout_session',
	url: 'https://checkout.stripe.test/mock',
});

vi.mock('../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: queueEmailMock,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendWaitlistNotificationSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: createCheckoutSessionMock,
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/ticket-notifications', () => ({
	sendTicketNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/csrf', () => ({
	validateCsrfToken: () => true,
}));

vi.mock('../../src/lib/server/rate-limit', () => ({
	strictRateLimiter: { check: vi.fn().mockResolvedValue(true), getReset: vi.fn().mockResolvedValue(0) },
	RateLimitUnavailableError: class extends Error {},
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

async function seedEvent(published: boolean, overrides: Partial<typeof events.$inferInsert> = {}) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: published ? 'Published Dinner' : 'Draft Dinner',
			titleFr: published ? 'Dîner publié' : 'Dîner brouillon',
			slug: `${published ? 'published' : 'draft'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-06-01'),
			endDate: new Date('2099-06-01'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			published,
			...overrides,
		})
		.returning();
	return event;
}

async function seedSeating(
	eventId: string,
	overrides: Partial<typeof eventSessions.$inferInsert> = {},
	price: { priceAmount?: number | null } = {}
) {
	const startTime = overrides.startTime ?? new Date('2099-06-01T19:00:00Z');
	const endTime = overrides.endTime ?? new Date('2099-06-01T22:00:00Z');
	const serviceId = await seedServiceForSession(testDb, eventId, startTime, endTime, price);
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
			...overrides,
		})
		.returning();
	return seating;
}

function postJson(url: string, body: unknown, locals = ANONYMOUS_LOCALS) {
	return {
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
		getClientAddress: () => '127.0.0.1',
		locals,
	} as any;
}

const reservationBody = (sessionId: string) => ({
	sessionId,
	email: 'guest@example.com',
	name: 'Guest',
	quantity: 1,
});

const waitlistBody = (sessionId: string) => ({
	sessionId,
	email: 'guest@example.com',
	name: 'Guest',
	quantity: 1,
});

async function availableCapacity(seatingId: string) {
	const [row] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, seatingId));
	return row.availableCapacity;
}

// ---------------------------------------------------------------------------
// A Draft is not found
// ---------------------------------------------------------------------------

describe('a Draft is not found', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it.each([['anonymous', ANONYMOUS_LOCALS], ['Admin', ADMIN_LOCALS]])(
		'its page answers 404 to the %s viewer',
		async (_, locals) => {
			const draft = await seedEvent(false);
			await seedSeating(draft.id);
			const { load } = await import('../../src/routes/(public)/events/[slug]/+page.server');
			await expect(load({ params: { slug: draft.slug }, locals } as any)).rejects.toMatchObject({ status: 404 });
		}
	);

	it('a published Event page still loads', async () => {
		const event = await seedEvent(true);
		await seedSeating(event.id);
		const { load } = await import('../../src/routes/(public)/events/[slug]/+page.server');
		const data: any = await load({ params: { slug: event.slug }, locals: ANONYMOUS_LOCALS } as any);
		expect(data.event.id).toBe(event.id);
		expect(data.sessions).toHaveLength(1);
	});

	it('its booking page answers 404', async () => {
		const draft = await seedEvent(false);
		const seating = await seedSeating(draft.id);
		const { load } = await import('../../src/routes/(public)/events/[slug]/book/[sessionId]/+page.server');
		await expect(
			load({ params: { slug: draft.slug, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('its .ics endpoint answers 404', async () => {
		const draft = await seedEvent(false);
		const seating = await seedSeating(draft.id);
		const { GET } = await import('../../src/routes/api/events/[slug]/sessions/[sessionId]/calendar.ics/+server');
		await expect(
			GET({ params: { slug: draft.slug, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('the .ics endpoint still serves a published Event', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id);
		const { GET } = await import('../../src/routes/api/events/[slug]/sessions/[sessionId]/calendar.ics/+server');
		const response = await GET({ params: { slug: event.slug, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any);
		expect(response.status).toBe(200);
	});

	it('its Seatings API answers 404', async () => {
		const draft = await seedEvent(false);
		await seedSeating(draft.id);
		const { GET } = await import('../../src/routes/api/events/[slug]/sessions/+server');
		const response = await GET({ params: { slug: draft.slug }, locals: ANONYMOUS_LOCALS } as any);
		expect(response.status).toBe(404);
	});

	it('the Event API answers 404 to an anonymous viewer, not to the Admin', async () => {
		const draft = await seedEvent(false);
		const { GET } = await import('../../src/routes/api/events/[id]/+server');
		await expect(GET({ params: { id: draft.id }, locals: ANONYMOUS_LOCALS } as any)).rejects.toMatchObject({ status: 404 });
		const response = await GET({ params: { id: draft.id }, locals: ADMIN_LOCALS } as any);
		expect(response.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// A Draft cannot be booked or wait-listed
// ---------------------------------------------------------------------------

describe('a Draft cannot be booked or wait-listed', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('the reservation service refuses it inside the locking transaction, even with valid ids', async () => {
		const draft = await seedEvent(false);
		const seating = await seedSeating(draft.id);
		const { createReservation, SeatingNotBookableError } = await import('../../src/lib/server/services/reservations');

		const attempt = createReservation(reservationBody(seating.id));
		await expect(attempt).rejects.toBeInstanceOf(SeatingNotBookableError);
		await expect(createReservation(reservationBody(seating.id))).rejects.toMatchObject({ reason: 'event-not-published' });

		expect(await availableCapacity(seating.id)).toBe(10);
		expect(await testDb.select().from(reservations)).toHaveLength(0);
		expect(createCheckoutSessionMock).not.toHaveBeenCalled();
	});

	it('the reservation API answers 404', async () => {
		const draft = await seedEvent(false);
		const seating = await seedSeating(draft.id);
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(404);
		expect(await testDb.select().from(reservations)).toHaveLength(0);
	});

	it('the reservation API still books a published Event', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id);
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(201);
		expect(await availableCapacity(seating.id)).toBe(9);
	});

	it('joining its Waitlist is refused', async () => {
		const draft = await seedEvent(false);
		const seating = await seedSeating(draft.id, { availableCapacity: 0 });
		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		await expect(joinWaitlist(waitlistBody(seating.id))).rejects.toMatchObject({ reason: 'event-not-published' });

		const { POST } = await import('../../src/routes/api/waitlist/join/+server');
		const response = await POST(postJson('http://x/api/waitlist/join', waitlistBody(seating.id)));
		expect(response.status).toBe(404);
		expect(await testDb.select().from(waitlist)).toHaveLength(0);
	});

	it('no Waitlist notification is sent for it', async () => {
		const draft = await seedEvent(false);
		const seating = await seedSeating(draft.id, { availableCapacity: 2 });
		await testDb.insert(waitlist).values({
			eventSessionId: seating.id,
			email: 'waiting@example.com',
			name: 'Waiting Guest',
			quantity: 1,
			notified: false,
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		});
		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');

		expect(await notifyWaitlist(seating.id, 2)).toEqual({ notified: 0 });
		expect(queueEmailMock).not.toHaveBeenCalled();
		const [entry] = await testDb.select().from(waitlist);
		expect(entry.notified).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// A Draft is listed nowhere
// ---------------------------------------------------------------------------

describe('a Draft is listed nowhere', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('is absent from the Events listing', async () => {
		const draft = await seedEvent(false);
		const event = await seedEvent(true);
		const { load } = await import('../../src/routes/(public)/events/+page.server');
		const data: any = await load({ url: new URL('http://x/events'), locals: ANONYMOUS_LOCALS } as any);
		const ids = data.events.map((e: { id: string }) => e.id);
		expect(ids).toContain(event.id);
		expect(ids).not.toContain(draft.id);
	});

	it('is absent from the Events API, even when asking for unpublished Events', async () => {
		const draft = await seedEvent(false);
		await seedEvent(true);
		const { GET } = await import('../../src/routes/api/events/+server');
		for (const query of ['', '?published=false', '?q=Dinner', '?published=false&q=Dinner']) {
			const response = await GET({
				url: new URL(`http://x/api/events${query}`),
				locals: ANONYMOUS_LOCALS,
				setHeaders: () => {},
			} as any);
			const body = await response.json();
			expect(body.data.map((e: { id: string }) => e.id)).not.toContain(draft.id);
			expect(body.data).toHaveLength(1);
		}
	});

	it('is absent from the homepage gallery', async () => {
		const draft = await seedEvent(false);
		const event = await seedEvent(true);
		const { load } = await import('../../src/routes/(public)/+page.server');
		const data: any = await load({ locals: ANONYMOUS_LOCALS } as any);
		const ids = data.events.map((e: { id: string }) => e.id);
		expect(ids).toContain(event.id);
		expect(ids).not.toContain(draft.id);
	});

	it('is never the Spotlight', async () => {
		await seedEvent(false, { isSpotlight: true });
		const { getSpotlightEvent } = await import('../../src/lib/server/services/events');
		expect(await getSpotlightEvent()).toBeNull();

		const { load } = await import('../../src/routes/(public)/spotlight/+page.server');
		const data: any = await load({ locals: ANONYMOUS_LOCALS } as any);
		expect(data.spotlightEvent).toBeNull();
	});

	it('a published Spotlight is still shown', async () => {
		const event = await seedEvent(true, { isSpotlight: true });
		const { getSpotlightEvent } = await import('../../src/lib/server/services/events');
		expect((await getSpotlightEvent())?.id).toBe(event.id);
	});

	it('is absent from the sitemap', async () => {
		const draft = await seedEvent(false);
		const event = await seedEvent(true);
		const { GET } = await import('../../src/routes/sitemap.xml/+server');
		const xml = await (await GET()).text();
		expect(xml).toContain(`/events/${event.slug}`);
		expect(xml).not.toContain(draft.slug);
	});

	it('the listing query agrees with Event access for every Event', async () => {
		const seeded = [await seedEvent(false), await seedEvent(true)];
		const { listedEventsCondition, toAccessEvent } = await import('../../src/lib/server/services/event-access');
		const { isListed } = await import('../../src/lib/utils/event-access');
		const listed = await testDb.select({ id: events.id }).from(events).where(listedEventsCondition());
		const listedIds = new Set(listed.map((row) => row.id));
		for (const event of seeded) {
			expect(listedIds.has(event.id)).toBe(isListed(toAccessEvent(event)));
		}
	});
});

// ---------------------------------------------------------------------------
// A published Event whose Service has no price
// ---------------------------------------------------------------------------

describe('a Seating whose Service has no price', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('is shown as not yet bookable on the public page', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id, {}, { priceAmount: null });
		const { load } = await import('../../src/routes/(public)/events/[slug]/+page.server');
		const data: any = await load({ params: { slug: event.slug }, locals: ANONYMOUS_LOCALS } as any);
		const shown = data.sessions.find((s: { id: string }) => s.id === seating.id);
		expect(shown.bookingRefusal).toBe('not-priced');
		expect(shown.waitlistOpen).toBe(false);
	});

	it('a priced Seating is shown as bookable', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id);
		const { load } = await import('../../src/routes/(public)/events/[slug]/+page.server');
		const data: any = await load({ params: { slug: event.slug }, locals: ANONYMOUS_LOCALS } as any);
		const shown = data.sessions.find((s: { id: string }) => s.id === seating.id);
		expect(shown.bookingRefusal).toBeNull();
	});

	it('is shown as not yet bookable on the Spotlight', async () => {
		const event = await seedEvent(true, { isSpotlight: true });
		const seating = await seedSeating(event.id, {}, { priceAmount: null });
		const { load } = await import('../../src/routes/(public)/spotlight/+page.server');
		const data: any = await load({ locals: ANONYMOUS_LOCALS } as any);
		const shown = data.spotlightEvent.eventSessions.find((s: { id: string }) => s.id === seating.id);
		expect(shown.bookingRefusal).toBe('not-priced');
	});

	it('cannot be booked through the reservation API', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id, {}, { priceAmount: null });
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe('NOT_PRICED');
		expect(await availableCapacity(seating.id)).toBe(10);
	});

	it('cannot be wait-listed', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id, { availableCapacity: 0 }, { priceAmount: null });
		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		await expect(joinWaitlist(waitlistBody(seating.id))).rejects.toMatchObject({ reason: 'not-priced' });
	});
});

// @vitest-environment node
/**
 * Issue 032 — a Private Event is seen and booked by anyone holding its id
 * link, exactly like a Public one, but it is listed nowhere, never in the
 * sitemap, sends `noindex` and can never be the Spotlight.
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

async function seedEvent(
	visibility: 'draft' | 'private' | 'public',
	overrides: Partial<typeof events.$inferInsert> = {}
) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: `${visibility} Dinner`,
			titleFr: `Dîner ${visibility}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-06-01'),
			endDate: new Date('2099-06-01'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			visibility,
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

function headersOf() {
	const headers: Record<string, string> = {};
	return { headers, setHeaders: (h: Record<string, string>) => Object.assign(headers, h) };
}

// ---------------------------------------------------------------------------
// Reached and booked by its link
// ---------------------------------------------------------------------------

describe('a Private Event is reached and booked by its id link', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('its page loads for an anonymous visitor and sends noindex', async () => {
		const event = await seedEvent('private');
		await seedSeating(event.id);
		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		const { headers, setHeaders } = headersOf();
		const data: any = await load({ params: { id: event.id }, locals: ANONYMOUS_LOCALS, setHeaders } as any);
		expect(data.event.id).toBe(event.id);
		expect(data.sessions).toHaveLength(1);
		expect(data.sessions[0].bookingRefusal).toBeNull();
		expect(data.indexed).toBe(false);
		expect(headers['X-Robots-Tag']).toBe('noindex');
	});

	it('a Public Event page is indexed and sends no robots header', async () => {
		const event = await seedEvent('public');
		await seedSeating(event.id);
		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		const { headers, setHeaders } = headersOf();
		const data: any = await load({ params: { id: event.id }, locals: ANONYMOUS_LOCALS, setHeaders } as any);
		expect(data.indexed).toBe(true);
		expect(headers['X-Robots-Tag']).toBeUndefined();
	});

	it('its booking page loads for an anonymous visitor', async () => {
		const event = await seedEvent('private');
		const seating = await seedSeating(event.id);
		const { load } = await import('../../src/routes/(public)/events/[id]/book/[sessionId]/+page.server');
		const data: any = await load({ params: { id: event.id, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any);
		expect(data.session.id).toBe(seating.id);
	});

	it('the reservation API books it', async () => {
		const event = await seedEvent('private');
		const seating = await seedSeating(event.id);
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(201);
		expect(await availableCapacity(seating.id)).toBe(9);
	});

	it('its Waitlist can be joined', async () => {
		const event = await seedEvent('private');
		const seating = await seedSeating(event.id, { availableCapacity: 0 });
		const { POST } = await import('../../src/routes/api/waitlist/join/+server');
		const response = await POST(postJson('http://x/api/waitlist/join', waitlistBody(seating.id)));
		expect(response.status).toBeLessThan(300);
		expect(await testDb.select().from(waitlist)).toHaveLength(1);
	});

	it('its .ics endpoint serves it', async () => {
		const event = await seedEvent('private');
		const seating = await seedSeating(event.id);
		const { GET } = await import('../../src/routes/api/events/[id]/sessions/[sessionId]/calendar.ics/+server');
		const response = await GET({ params: { id: event.id, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any);
		expect(response.status).toBe(200);
	});

	it('moving it back to Draft takes it offline (404)', async () => {
		const event = await seedEvent('private');
		const seating = await seedSeating(event.id);
		const { updateEvent } = await import('../../src/lib/server/services/events');
		await updateEvent(event.id, { visibility: 'draft' });

		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		await expect(
			load({ params: { id: event.id }, locals: ANONYMOUS_LOCALS, setHeaders: () => {} } as any)
		).rejects.toMatchObject({ status: 404 });
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(404);
		expect(await testDb.select().from(reservations)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Listed nowhere
// ---------------------------------------------------------------------------

describe('a Private Event is listed nowhere', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('is absent from the Events listing', async () => {
		const priv = await seedEvent('private');
		const pub = await seedEvent('public', { isPortfolio: true });
		const { load } = await import('../../src/routes/(public)/events/+page.server');
		const data: any = await load({ url: new URL('http://x/events'), locals: ANONYMOUS_LOCALS } as any);
		const ids = data.events.map((e: { id: string }) => e.id);
		expect(ids).toContain(pub.id);
		expect(ids).not.toContain(priv.id);
	});

	it('is absent from the Events API for anyone but an Admin asking for unlisted Events', async () => {
		const priv = await seedEvent('private');
		await seedEvent('public', { isPortfolio: true });
		const { GET } = await import('../../src/routes/api/events/+server');
		for (const query of ['', '?published=false', '?q=Dinner']) {
			const response = await GET({
				url: new URL(`http://x/api/events${query}`),
				locals: ANONYMOUS_LOCALS,
				setHeaders: () => {},
			} as any);
			const body = await response.json();
			expect(body.data.map((e: { id: string }) => e.id)).not.toContain(priv.id);
			expect(body.data).toHaveLength(1);
		}
	});

	it('is absent from the homepage gallery', async () => {
		const priv = await seedEvent('private');
		const pub = await seedEvent('public', { isPortfolio: true });
		const { load } = await import('../../src/routes/(public)/+page.server');
		const data: any = await load({ locals: ANONYMOUS_LOCALS } as any);
		const ids = data.events.map((e: { id: string }) => e.id);
		expect(ids).toContain(pub.id);
		expect(ids).not.toContain(priv.id);
	});

	it('is absent from the sitemap', async () => {
		const priv = await seedEvent('private');
		const pub = await seedEvent('public');
		const { GET } = await import('../../src/routes/sitemap.xml/+server');
		const xml = await (await GET()).text();
		expect(xml).toContain(`/events/${pub.id}`);
		expect(xml).not.toContain(priv.id);
	});

	it('is never the Spotlight, even if flagged', async () => {
		await seedEvent('private', { isSpotlight: true });
		const { getSpotlightEvent } = await import('../../src/lib/server/services/events');
		expect(await getSpotlightEvent()).toBeNull();

		const { load } = await import('../../src/routes/(public)/spotlight/+page.server');
		// No Spotlight: the page stays (no redirect to an Event page).
		expect(await load({ locals: ANONYMOUS_LOCALS } as any).then(() => null, (e: any) => e?.location ?? Promise.reject(e))).toBeNull();
	});

	it('the listing query agrees with Event access for every Visibility', async () => {
		const seeded = [
			await seedEvent('draft'),
			await seedEvent('private'),
			await seedEvent('public'),
			await seedEvent('public', { isPortfolio: true }),
			await seedEvent('private', { isPortfolio: true }),
		];
		const { listedEventsCondition, toAccessEvent } = await import('../../src/lib/server/services/event-access');
		const { isListed } = await import('../../src/lib/utils/event-access');
		const listed = await testDb.select({ id: events.id }).from(events).where(listedEventsCondition());
		const listedIds = new Set(listed.map((row) => row.id));
		for (const event of seeded) {
			expect(listedIds.has(event.id)).toBe(isListed(toAccessEvent(event)));
		}
		// The Portfolio is listed whatever its Visibility, except a Draft.
		expect(listedIds.size).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Only a Public Event can be the Spotlight
// ---------------------------------------------------------------------------

describe('only a Public Event can be the Spotlight', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	async function spotlightOf(id: string) {
		const [row] = await testDb.select({ isSpotlight: events.isSpotlight }).from(events).where(eq(events.id, id));
		return row.isSpotlight;
	}

	it.each(['draft', 'private'] as const)('making a %s Event the Spotlight is refused', async (visibility) => {
		const event = await seedEvent(visibility);
		const other = await seedEvent('public', { isSpotlight: true });
		const { updateEvent, SpotlightRequiresPublicError } = await import('../../src/lib/server/services/events');
		await expect(updateEvent(event.id, { isSpotlight: true })).rejects.toBeInstanceOf(SpotlightRequiresPublicError);
		expect(await spotlightOf(event.id)).toBe(false);
		// The current Spotlight is left alone.
		expect(await spotlightOf(other.id)).toBe(true);
	});

	it.each(['draft', 'private'] as const)('creating a %s Event as the Spotlight is refused', async (visibility) => {
		const { createEvent, SpotlightRequiresPublicError } = await import('../../src/lib/server/services/events');
		await expect(
			createEvent({
				titleEn: 'New', titleFr: 'Nouveau', descriptionEn: 'Test', descriptionFr: 'Test',
				startDate: new Date('2099-06-01'), endDate: new Date('2099-06-01'),
				locationEn: 'Venue', locationFr: 'Salle',
				visibility, isSpotlight: true,
			} as any)
		).rejects.toBeInstanceOf(SpotlightRequiresPublicError);
		expect(await testDb.select().from(events)).toHaveLength(0);
	});

	it.each(['draft', 'private'] as const)('switching the Spotlight to %s clears it', async (visibility) => {
		const event = await seedEvent('public', { isSpotlight: true });
		const { updateEvent, getSpotlightEvent } = await import('../../src/lib/server/services/events');
		const updated = await updateEvent(event.id, { visibility });
		expect(updated.visibility).toBe(visibility);
		expect(updated.isSpotlight).toBe(false);
		expect(await getSpotlightEvent()).toBeNull();
	});

	it('choosing Privé and the Spotlight together is refused', async () => {
		const event = await seedEvent('public', { isSpotlight: true });
		const { updateEvent, SpotlightRequiresPublicError } = await import('../../src/lib/server/services/events');
		await expect(updateEvent(event.id, { visibility: 'private', isSpotlight: true }))
			.rejects.toBeInstanceOf(SpotlightRequiresPublicError);
		expect(await spotlightOf(event.id)).toBe(true);
	});

	it('a Public Event can still be made the Spotlight, replacing the current one', async () => {
		const current = await seedEvent('public', { isSpotlight: true });
		const event = await seedEvent('public');
		const { updateEvent } = await import('../../src/lib/server/services/events');
		await updateEvent(event.id, { isSpotlight: true });
		expect(await spotlightOf(event.id)).toBe(true);
		expect(await spotlightOf(current.id)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The Admin chooses the Visibility on the Event
// ---------------------------------------------------------------------------

describe('the Admin chooses Brouillon / Privé / Public', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	function updateEventForm(eventId: string, fields: Record<string, string>) {
		const form = new FormData();
		const defaults = {
			titleEn: 'Dinner', titleFr: 'Dîner', descriptionEn: 'Test', descriptionFr: 'Test',
			locationEn: 'Venue', locationFr: 'Salle',
		};
		for (const [key, value] of Object.entries({ ...defaults, ...fields })) form.set(key, value);
		return {
			request: new Request('http://x/admin/events/' + eventId + '?/updateEvent', { method: 'POST', body: form }),
			params: { id: eventId },
			locals: ADMIN_LOCALS,
		} as any;
	}

	it('saves the chosen Visibility', async () => {
		const event = await seedEvent('draft');
		await seedSeating(event.id);
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const result: any = await actions.updateEvent(updateEventForm(event.id, { visibility: 'private' }));
		expect(result?.status).toBeUndefined();
		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.visibility).toBe('private');
	});

	it('publishes an Event without any Seating (ADR 0008 supersedes ADR 0001)', async () => {
		const event = await seedEvent('draft');
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const result: any = await actions.updateEvent(updateEventForm(event.id, { visibility: 'public' }));
		expect(result?.status).toBeUndefined();
		const [row] = await testDb.select().from(events).where(eq(events.id, event.id));
		expect(row.visibility).toBe('public');
	});

	it('the Event API publishes an Event without any Seating', async () => {
		const event = await seedEvent('draft');
		const { PUT } = await import('../../src/routes/api/events/[id]/+server');
		const response = await PUT({
			params: { id: event.id },
			request: new Request(`http://x/api/events/${event.id}`, {
				method: 'PUT',
				body: JSON.stringify({ visibility: 'private' }),
			}),
			locals: ADMIN_LOCALS,
		} as any);
		expect(response.status).toBe(200);
		expect((await response.json()).visibility).toBe('private');
	});

	it('refuses Privé with the Spotlight, in French', async () => {
		const event = await seedEvent('public');
		await seedSeating(event.id);
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const result: any = await actions.updateEvent(
			updateEventForm(event.id, { visibility: 'private', isSpotlight: 'true' })
		);
		expect(result.status).toBe(400);
		expect(result.data.error).toMatch(/Seul un événement Public/);
	});

	it('refuses an unknown Visibility', async () => {
		const event = await seedEvent('draft');
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const result: any = await actions.updateEvent(updateEventForm(event.id, { visibility: 'hidden' }));
		expect(result.status).toBe(400);
	});

	it('the admin Events list carries each Event\'s Visibility', async () => {
		await seedEvent('draft');
		await seedEvent('private');
		await seedEvent('public');
		const { load } = await import('../../src/routes/(admin)/admin/events/+page.server');
		const data: any = await load({ url: new URL('http://x/admin/events'), locals: ADMIN_LOCALS } as any);
		expect(data.events.map((e: { visibility: string }) => e.visibility).sort()).toEqual(['draft', 'private', 'public']);
	});
});

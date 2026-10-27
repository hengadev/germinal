// @vitest-environment node
/**
 * Issue 035 — the Booking Window: before it opens, and once it has closed
 * for a Seating, the Seating cannot be booked or wait-listed; its Waitlist
 * entries expire when it closes; the public page says when booking opens
 * or that it is closed; the Admin sets it in « Dates & séances ».
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

async function seedEvent(published: boolean, overrides: Partial<typeof events.$inferInsert> = {}) {
	// A published Event is Public, an unpublished one a Draft (issue 032).
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: published ? 'Published Dinner' : 'Draft Dinner',
			titleFr: published ? 'Dîner publié' : 'Dîner brouillon',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-06-01'),
			endDate: new Date('2099-06-01'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			visibility: published ? 'public' : 'draft',
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

function postJson(
	url: string,
	body: unknown,
	locals: typeof ANONYMOUS_LOCALS | typeof ADMIN_LOCALS = ANONYMOUS_LOCALS
) {
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

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

/** A Public Event whose one Seating starts in `startsInHours` hours. */
async function seedWindow(
	window: { bookingOpensAt?: Date | null; bookingClosesHoursBefore?: number | null },
	{ startsInHours = 72, availableCapacity = 10 }: { startsInHours?: number; availableCapacity?: number } = {}
) {
	const event = await seedEvent(true, window);
	const seating = await seedSeating(event.id, {
		startTime: inHours(startsInHours),
		endTime: inHours(startsInHours + 3),
		availableCapacity,
	});
	return { event, seating };
}

async function waitlistEntry(seatingId: string, expiresAt = inHours(24 * 7)) {
	const [entry] = await testDb
		.insert(waitlist)
		.values({
			eventSessionId: seatingId,
			email: 'waiting@example.com',
			name: 'Waiting Guest',
			quantity: 1,
			notified: false,
			expiresAt,
		})
		.returning();
	return entry;
}

describe('booking outside the Booking Window', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('is refused before opening, inside the locking transaction, saying when it opens', async () => {
		const opensAt = inHours(24);
		const { seating } = await seedWindow({ bookingOpensAt: opensAt });
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		await expect(createReservation(reservationBody(seating.id))).rejects.toMatchObject({ reason: 'not-open', opensAt });

		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: 'BOOKING_NOT_OPEN', opensAt: opensAt.toISOString() });

		expect(await availableCapacity(seating.id)).toBe(10);
		expect(await testDb.select().from(reservations)).toHaveLength(0);
		expect(createCheckoutSessionMock).not.toHaveBeenCalled();
	});

	it('is refused after closing, before the Seating starts', async () => {
		const { seating } = await seedWindow({ bookingClosesHoursBefore: 48 }, { startsInHours: 24 });
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: 'BOOKING_CLOSED' });
		expect(await availableCapacity(seating.id)).toBe(10);
		expect(await testDb.select().from(reservations)).toHaveLength(0);
	});

	it('goes through inside the window', async () => {
		const { seating } = await seedWindow({ bookingOpensAt: inHours(-1), bookingClosesHoursBefore: 24 }, { startsInHours: 48 });
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(201);
		expect(await availableCapacity(seating.id)).toBe(9);
	});

	it('goes through with neither setting, as before', async () => {
		const { seating } = await seedWindow({}, { startsInHours: 1 });
		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(201);
	});

	it('the booking page is not found outside the window', async () => {
		const { event, seating } = await seedWindow({ bookingOpensAt: inHours(24) });
		const { load } = await import('../../src/routes/(public)/events/[id]/book/[sessionId]/+page.server');
		await expect(
			load({ params: { id: event.id, sessionId: seating.id }, locals: ANONYMOUS_LOCALS } as any)
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('the Waitlist and the Booking Window', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('joining is refused before opening', async () => {
		const { seating } = await seedWindow({ bookingOpensAt: inHours(24) }, { availableCapacity: 0 });
		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		await expect(joinWaitlist(waitlistBody(seating.id))).rejects.toMatchObject({ reason: 'not-open' });

		const { POST } = await import('../../src/routes/api/waitlist/join/+server');
		const response = await POST(postJson('http://x/api/waitlist/join', waitlistBody(seating.id)));
		expect(response.status).toBe(400);
		expect(await testDb.select().from(waitlist)).toHaveLength(0);
	});

	it('joining is refused after closing', async () => {
		const { seating } = await seedWindow({ bookingClosesHoursBefore: 48 }, { startsInHours: 24, availableCapacity: 0 });
		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		await expect(joinWaitlist(waitlistBody(seating.id))).rejects.toMatchObject({ reason: 'closed' });
		expect(await testDb.select().from(waitlist)).toHaveLength(0);
	});

	it('an entry joined inside the window expires when it closes, if that comes before 7 days', async () => {
		const { seating } = await seedWindow({ bookingClosesHoursBefore: 24 }, { startsInHours: 72, availableCapacity: 0 });
		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		const entry = await joinWaitlist(waitlistBody(seating.id));
		expect(entry.expiresAt.getTime()).toBe(seating.startTime.getTime() - 24 * HOUR);
	});

	it('an entry still expires after 7 days when the window closes later', async () => {
		const { seating } = await seedWindow({}, { startsInHours: 24 * 30, availableCapacity: 0 });
		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		const before = Date.now();
		const entry = await joinWaitlist(waitlistBody(seating.id));
		expect(entry.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * HOUR);
		expect(entry.expiresAt.getTime()).toBeLessThan(seating.startTime.getTime());
	});

	it('no notification is sent for a closed Seating', async () => {
		const { seating } = await seedWindow({ bookingClosesHoursBefore: 48 }, { startsInHours: 24, availableCapacity: 2 });
		await waitlistEntry(seating.id);
		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		expect(await notifyWaitlist(seating.id, 2)).toEqual({ notified: 0 });
		expect(queueEmailMock).not.toHaveBeenCalled();
	});

	it('the job expires the entries of closed Seatings only', async () => {
		const closed = await seedWindow({ bookingClosesHoursBefore: 48 }, { startsInHours: 24 });
		const open = await seedWindow({ bookingClosesHoursBefore: 12 }, { startsInHours: 24 });
		const started = await seedWindow({}, { startsInHours: -1 });
		const closedEntry = await waitlistEntry(closed.seating.id);
		const openEntry = await waitlistEntry(open.seating.id);
		const startedEntry = await waitlistEntry(started.seating.id);

		const { expireClosedWaitlistEntries } = await import('../../src/lib/server/services/waitlist');
		const now = new Date();
		expect(await expireClosedWaitlistEntries(now)).toEqual({ expired: 2 });

		const rows = new Map((await testDb.select().from(waitlist)).map((row) => [row.id, row]));
		expect(rows.get(closedEntry.id)!.expiresAt.getTime()).toBe(now.getTime());
		expect(rows.get(startedEntry.id)!.expiresAt.getTime()).toBe(now.getTime());
		expect(rows.get(openEntry.id)!.expiresAt.getTime()).toBe(openEntry.expiresAt.getTime());

		// Already expired entries are left as they are.
		expect(await expireClosedWaitlistEntries(new Date(now.getTime() + 1000))).toEqual({ expired: 0 });
	});
});

describe('the public page and the Booking Window', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('before opening, shows the Seating and its price, when booking opens, and no Waitlist', async () => {
		const opensAt = inHours(24);
		const { event } = await seedWindow({ bookingOpensAt: opensAt }, { availableCapacity: 0 });
		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		const data: any = await load({ params: { id: event.id }, locals: ANONYMOUS_LOCALS, setHeaders: () => {} } as any);
		expect(data.sessions).toHaveLength(1);
		expect(data.sessions[0]).toMatchObject({ bookingRefusal: 'not-open', bookingOpensAt: opensAt, waitlistOpen: false, priceAmount: 2500 });
		expect(data.schedule[0].services[0].priceAmount).toBe(2500);
	});

	it('after closing, shows the Seating as closed', async () => {
		const { event } = await seedWindow({ bookingClosesHoursBefore: 48 }, { startsInHours: 24 });
		const { load } = await import('../../src/routes/(public)/events/[id]/+page.server');
		const data: any = await load({ params: { id: event.id }, locals: ANONYMOUS_LOCALS, setHeaders: () => {} } as any);
		expect(data.sessions[0]).toMatchObject({ bookingRefusal: 'closed', bookingOpensAt: null, waitlistOpen: false });
	});
});

describe('the Admin sets the Booking Window in « Dates & séances »', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	function saveSeatingsEvent(eventId: string, seating: typeof eventSessions.$inferSelect, window: Record<string, string>) {
		const form = new FormData();
		form.set('days', JSON.stringify([{ date: '2099-06-01', kinds: ['dinner'] }]));
		form.set('serviceRefs', '[]');
		form.set(
			'services',
			JSON.stringify([
				{
					serviceId: seating.serviceId,
					defaultDurationMinutes: 180,
					seatings: [
						{
							id: seating.id,
							start: '20:00',
							end: '22:00',
							titleEn: null,
							titleFr: null,
							descriptionEn: null,
							descriptionFr: null,
							capacityOverride: null,
							published: true,
							allowWaitlist: true,
							badgeType: 'none',
						},
					],
				},
			])
		);
		form.set('venueCapacity', '10');
		for (const [key, value] of Object.entries(window)) form.set(key, value);
		return {
			request: new Request('http://x/admin/events/' + eventId, { method: 'POST', body: form }),
			params: { id: eventId },
			locals: ADMIN_LOCALS,
		} as any;
	}

	async function eventRow(id: string) {
		const [row] = await testDb.select().from(events).where(eq(events.id, id));
		return row;
	}

	it('saves the opening on the Event\'s clock and the closing hours, and clears them when left empty', async () => {
		const event = await seedEvent(true, { timeZone: 'Europe/London' });
		const seating = await seedSeating(event.id);
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');

		const saved: any = await actions.saveSeatings!(
			saveSeatingsEvent(event.id, seating, { bookingOpensAt: '2099-05-01T10:00', bookingClosesHoursBefore: '24' })
		);
		expect(saved).toMatchObject({ success: expect.any(String) });
		let row = await eventRow(event.id);
		// 10:00 in London in May is 09:00 UTC.
		expect(row.bookingOpensAt).toEqual(new Date('2099-05-01T09:00:00Z'));
		expect(row.bookingClosesHoursBefore).toBe(24);

		await actions.saveSeatings!(saveSeatingsEvent(event.id, seating, { bookingOpensAt: '', bookingClosesHoursBefore: '' }));
		row = await eventRow(event.id);
		expect(row.bookingOpensAt).toBeNull();
		expect(row.bookingClosesHoursBefore).toBeNull();
	});

	it('refuses an invalid closing', async () => {
		const event = await seedEvent(true);
		const seating = await seedSeating(event.id);
		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const result: any = await actions.saveSeatings!(
			saveSeatingsEvent(event.id, seating, { bookingClosesHoursBefore: '-3' })
		);
		expect(result.status).toBe(400);
		expect((await eventRow(event.id)).bookingClosesHoursBefore).toBeNull();
	});

	it('a Time Zone change keeps the opening\'s wall-clock time', async () => {
		const event = await seedEvent(true, { bookingOpensAt: new Date('2099-05-01T08:00:00Z') });
		const { changeEventTimeZone } = await import('../../src/lib/server/services/event-schedule');
		await changeEventTimeZone(event.id, 'Europe/London');
		// 10:00 in Paris → 10:00 in London.
		expect((await eventRow(event.id)).bookingOpensAt).toEqual(new Date('2099-05-01T09:00:00Z'));
	});
});

// @vitest-environment node
/**
 * Issue 039 — « Fermé aux réservations »: a Seating closed to bookings
 * refuses online bookings and Waitlist joins server-side until reopened;
 * Walk-ins still work; the Staff portal actions close and reopen with the
 * permission and Day checks, and record audit-log entries.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, events, eventSessions } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks (the same as booking-window.test.ts)
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../src/lib/server/mock-data', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/server/mock-data')>()),
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

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

async function seedEvent() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-06-01'),
			endDate: new Date('2099-06-01'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			visibility: 'public',
		})
		.returning();
	return event;
}

async function seedSeating(eventId: string, overrides: Partial<typeof eventSessions.$inferInsert> = {}) {
	const startTime = overrides.startTime ?? inHours(48);
	const endTime = overrides.endTime ?? inHours(51);
	const serviceId = await seedServiceForSession(testDb, eventId, startTime, endTime, { priceAmount: 20 });
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

const reservationBody = (sessionId: string) => ({
	sessionId,
	email: 'guest@example.com',
	name: 'Guest',
	quantity: 1,
});

function postJson(url: string, body: unknown) {
	return {
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
		getClientAddress: () => '127.0.0.1',
		locals: { user: null, csrfToken: 'token' },
	} as any;
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000039';
const ADMIN = { id: ADMIN_ID, email: 'admin@example.com', role: 'admin', createdAt: new Date() };

async function seedAdminUser() {
	const { users } = await import('../../src/lib/server/db/schema');
	await testDb
		.insert(users)
		.values({ id: ADMIN_ID, email: `admin-${ADMIN_ID}@example.com`, firstName: 'Admin', lastName: 'Test', passwordHash: 'x', role: 'admin' })
		.onConflictDoNothing();
}

async function closeViaAction(eventId: string, seatingIds: string[], locals = { user: ADMIN }) {
	const { actions } = await import('../../src/routes/(staff)/staff/events/[id]/+page.server');
	const body = new FormData();
	for (const id of seatingIds) body.append('seatingId', id);
	return actions.closeBookings({
		request: new Request(`http://x/staff/events/${eventId}`, { method: 'POST', body }),
		locals,
		params: { id: eventId },
	} as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('a Seating closed to bookings', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
		await seedAdminUser();
	});

	it('refuses bookings server-side, and reopens', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id, { bookingsClosedAt: new Date(), bookingsClosedBy: ADMIN.id });

		const { createReservation } = await import('../../src/lib/server/services/reservations');
		await expect(createReservation(reservationBody(seating.id))).rejects.toMatchObject({ reason: 'closed' });

		const { POST } = await import('../../src/routes/api/reservations/create/+server');
		const response = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: 'BOOKING_CLOSED' });
		expect(await testDb.select().from(eventSessions).where(eq(eventSessions.id, seating.id))).toMatchObject([
			{ availableCapacity: 10 },
		]);

		// Reopen: the booking goes through again.
		const { setSeatingBookingsClosed } = await import('../../src/lib/server/services/staff-portal');
		await setSeatingBookingsClosed({
			eventId: event.id,
			seatingIds: [seating.id],
			closed: false,
			actorId: ADMIN.id,
			day: null,
			admin: true,
		});
		const ok = await POST(postJson('http://x/api/reservations/create', reservationBody(seating.id)));
		expect(ok.status).toBe(201);
	});

	it('refuses Waitlist joins', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id, {
			bookingsClosedAt: new Date(),
			availableCapacity: 0,
			totalCapacity: 0,
		});
		const { POST } = await import('../../src/routes/api/waitlist/join/+server');
		const response = await POST(postJson('http://x/api/waitlist/join', { sessionId: seating.id, email: 'w@example.com', name: 'W', quantity: 1 }));
		expect(response.status).toBeGreaterThanOrEqual(400);
	});

	it('still takes a Walk-in', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id, { bookingsClosedAt: new Date() });
		const { createWalkIn } = await import('../../src/lib/server/services/walk-ins');
		const { eventDays, eventServices } = await import('../../src/lib/server/db/schema');
		const [service] = await testDb
			.select({ date: eventDays.date })
			.from(eventServices)
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventServices.id, seating.serviceId));
		const day = String(service.date);

		const result = await createWalkIn({
			access: { permissions: ['walk_in'], day, canSeeGuests: true, can: () => true } as any,
			eventId: event.id,
			seatingId: seating.id,
			name: 'Walked In',
			quantity: 2,
			actorId: ADMIN.id,
		});
		expect(result.ok).toBe(true);
	});
});

describe('the closeBookings and reopenBookings actions', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
		await seedAdminUser();
	});

	it('closes a Seating, records an audit entry, then reopens it', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id);

		const result = await closeViaAction(event.id, [seating.id]);
		expect(result).toMatchObject({ bookingsClosed: true });
		const [row] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, seating.id));
		expect(row.bookingsClosedAt).not.toBeNull();
		expect(row.bookingsClosedBy).toBe(ADMIN.id);
		const entries = await testDb.select().from(auditLog).where(eq(auditLog.action, 'seating.close_bookings'));
		expect(entries).toHaveLength(1);
		expect(entries[0].adminId).toBe(ADMIN.id);

		const { actions } = await import('../../src/routes/(staff)/staff/events/[id]/+page.server');
		const body = new FormData();
		body.set('seatingId', seating.id);
		const reopened = await actions.reopenBookings({
			request: new Request(`http://x/staff/events/${event.id}`, { method: 'POST', body }),
			locals: { user: ADMIN },
			params: { id: event.id },
		} as any);
		expect(reopened).toMatchObject({ bookingsReopened: true });
		const [after] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, seating.id));
		expect(after.bookingsClosedAt).toBeNull();
		expect(after.bookingsClosedBy).toBeNull();
		const reopenEntries = await testDb.select().from(auditLog).where(eq(auditLog.action, 'seating.reopen_bookings'));
		expect(reopenEntries).toHaveLength(1);
	});

	it('refuses a Seating of another Event', async () => {
		const eventA = await seedEvent();
		const eventB = await seedEvent();
		const seatingB = await seedSeating(eventB.id);
		const result = await closeViaAction(eventA.id, [seatingB.id]);
		expect(result).toMatchObject({ status: 422 });
		const [row] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, seatingB.id));
		expect(row.bookingsClosedAt).toBeNull();
	});

	it('refuses a Staff member without the current Day', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id);
		const { setSeatingBookingsClosed } = await import('../../src/lib/server/services/staff-portal');
		const result = await setSeatingBookingsClosed({
			eventId: event.id,
			seatingIds: [seating.id],
			closed: true,
			actorId: 'staff-1',
			day: null,
			admin: false,
		});
		expect(result).toMatchObject({ ok: false });
	});
});

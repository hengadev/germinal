// @vitest-environment node
/**
 * Issue 040 — « Nouvelle réservation »: the Staff portal's invite action
 * creates a free, confirmed comp Reservation on any upcoming published
 * Seating of the Event and emails the Ticket; it refuses a Staff member
 * without the invite permission, another Event's Seating, or a past
 * Seating; and it records an audit-log entry.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, events, eventSessions, reservations } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks (the same as close-bookings.test.ts)
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
			...overrides,
		})
		.returning();
	return seating;
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000040';
const ADMIN = { id: ADMIN_ID, email: 'admin@example.com', role: 'admin', createdAt: new Date() };

async function seedAdminUser() {
	const { users } = await import('../../src/lib/server/db/schema');
	await testDb
		.insert(users)
		.values({ id: ADMIN_ID, email: `admin-${ADMIN_ID}@example.com`, firstName: 'Admin', lastName: 'Test', passwordHash: 'x', role: 'admin' })
		.onConflictDoNothing();
}

async function inviteViaAction(
	eventId: string,
	seatingId: string,
	overrides: Record<string, string> = {},
	locals: any = { user: ADMIN }
) {
	const { actions } = await import('../../src/routes/(staff)/staff/events/[id]/+page.server');
	const body = new FormData();
	body.set('seatingId', seatingId);
	body.set('name', 'Invité');
	body.set('email', 'invite@example.com');
	body.set('quantity', '2');
	for (const [k, v] of Object.entries(overrides)) body.set(k, v);
	return actions.invite({
		request: new Request(`http://x/staff/events/${eventId}`, { method: 'POST', body }),
		locals,
		params: { id: eventId },
	} as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('the invite action (issue 040)', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
		await seedAdminUser();
	});

	it('creates a free confirmed comp Reservation, and records an audit entry', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id);

		const result = await inviteViaAction(event.id, seating.id);
		expect(result).toMatchObject({ invited: true, message: 'Invitation envoyée à Invité' });

		const [reservation] = await testDb.select().from(reservations).where(eq(reservations.eventSessionId, seating.id));
		expect(reservation).toMatchObject({
			guestEmail: 'invite@example.com',
			guestName: 'Invité',
			status: 'confirmed',
			isComp: true,
			quantity: 2,
			totalAmount: 0,
			depositAmount: 0,
			balanceAmount: 0,
			notificationPreference: 'email'
		});
		const [after] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, seating.id));
		expect(after.availableCapacity).toBe(8);

		const entries = await testDb.select().from(auditLog).where(eq(auditLog.action, 'reservation.invite'));
		expect(entries).toHaveLength(1);
		expect(entries[0].adminId).toBe(ADMIN.id);
		expect(entries[0].entityId).toBe(reservation.id);
	});

	it('refuses a Staff member without the invite permission', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id);
		const result = await inviteViaAction(event.id, seating.id, {}, { user: null });
		expect(result).toMatchObject({ status: 401 });

		// A Staff member whose Bar role (['tasks']) holds no invite permission.
		const { users, staffRoles, eventStaff } = await import('../../src/lib/server/db/schema');
		const [staffUser] = await testDb
			.insert(users)
			.values({ email: `staff-${ADMIN_ID}@example.com`, firstName: 'S', lastName: 'Taff', passwordHash: 'x', role: 'staff' })
			.returning();
		const [bar] = await testDb.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.name, 'Bar'));
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: bar.id });
		const refused = await inviteViaAction(event.id, seating.id, {}, { user: staffUser });
		expect(refused).toMatchObject({ status: 403 });
		const rows = await testDb.select().from(reservations);
		expect(rows).toHaveLength(0);
	});

	it('refuses a Seating of another Event', async () => {
		const eventA = await seedEvent();
		const eventB = await seedEvent();
		const seatingB = await seedSeating(eventB.id);
		const result = await inviteViaAction(eventA.id, seatingB.id);
		expect(result).toMatchObject({ status: 422 });
		const rows = await testDb.select().from(reservations);
		expect(rows).toHaveLength(0);
	});

	it('refuses a past Seating', async () => {
		const event = await seedEvent();
		const past = await seedSeating(event.id, { startTime: inHours(-48), endTime: inHours(-45) });
		const result = await inviteViaAction(event.id, past.id);
		expect(result).toMatchObject({ status: 422 });
		const rows = await testDb.select().from(reservations);
		expect(rows).toHaveLength(0);
	});

	it('refuses a full Seating (createCompReservation enforces capacity)', async () => {
		const event = await seedEvent();
		const full = await seedSeating(event.id, { availableCapacity: 0 });
		const result = await inviteViaAction(event.id, full.id);
		expect(result).toMatchObject({ status: 422 });
		const rows = await testDb.select().from(reservations);
		expect(rows).toHaveLength(0);
	});

	it('requires a name and a valid email', async () => {
		const event = await seedEvent();
		const seating = await seedSeating(event.id);
		expect(await inviteViaAction(event.id, seating.id, { name: '' })).toMatchObject({ status: 400 });
		expect(await inviteViaAction(event.id, seating.id, { email: 'pas-un-email' })).toMatchObject({ status: 400 });
	});
});

describe('the invite permission (issue 040)', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('lists only upcoming published Seatings of this Event', async () => {
		const { upcomingSeatingsForInvitation } = await import('../../src/lib/server/services/staff-portal');
		const event = await seedEvent();
		const other = await seedEvent();
		const upcoming = await seedSeating(event.id);
		await seedSeating(event.id, { published: false });
		await seedSeating(event.id, { startTime: inHours(-48), endTime: inHours(-45) });
		await seedSeating(other.id);

		const seatings = await upcomingSeatingsForInvitation(event.id);
		expect(seatings).toHaveLength(1);
		expect(seatings[0]).toMatchObject({ id: upcoming.id, remaining: 10 });
	});
});

// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import { createRefund } from '../../src/lib/server/services/stripe';

// ---------------------------------------------------------------------------
// Single postgres client shared between the mocked db and test assertions.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
//
// 1. Stripe — mocked at the service boundary so no real HTTP calls happen.
// 2. db    — replaced with the fixture's test-scoped drizzle instance backed
//            by germinal_test.
// 3. env   — provides test-safe values so no real secrets are needed.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout_session',
		url: 'https://checkout.stripe.test/mock',
	}),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
	createRefund: vi.fn().mockResolvedValue({
		id: 're_test_mock',
		amount: 2500,
		status: 'succeeded',
	}),
}));

vi.mock('../../src/lib/server/services/waitlist', () => ({
	notifyWaitlist: vi.fn().mockResolvedValue(undefined),
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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let cancelReservationWithRefund: Awaited<
	typeof import('../../src/lib/server/services/reservations')
>['cancelReservationWithRefund'];
let expireReservation: Awaited<
	typeof import('../../src/lib/server/services/reservations')
>['expireReservation'];

beforeAll(async () => {
	const mod = await import('../../src/lib/server/services/reservations');
	cancelReservationWithRefund = mod.cancelReservationWithRefund;
	expireReservation = mod.expireReservation;
});

afterAll(async () => {
	await closeTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a published event + session, returning both rows. */
async function seedPublishedSession(overrides?: Partial<typeof eventSessions.$inferInsert>) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Test Event',
			titleFr: 'Événement Test',
			slug: `test-event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			descriptionEn: 'Test description',
			descriptionFr: 'Description test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Test Location',
			locationFr: 'Lieu Test',
			published: true,
		})
		.returning();

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime: new Date('2099-06-01T18:00:00Z'),
			endTime: new Date('2099-06-01T22:00:00Z'),
			totalCapacity: 100,
			availableCapacity: 100,
			priceAmount: 2500,
			currency: 'EUR',
			published: true,
			...overrides,
		})
		.returning();

	return { event, session };
}

/**
 * Seed a confirmed reservation (with an associated payment) directly into the
 * database.  This mirrors the state left behind by `createReservation` +
 * `handlePaymentSuccess` without going through those code-paths.
 */
async function seedConfirmedReservation(sessionId: string, overrides?: { quantity?: number; totalAmount?: number }) {
	const quantity = overrides?.quantity ?? 2;
	const totalAmount = overrides?.totalAmount ?? 5000;

	const accessToken = `test-atk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail: 'guest@example.com',
			guestName: 'Test Guest',
			quantity,
			totalAmount,
			currency: 'EUR',
			status: 'confirmed',
			accessToken,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
			confirmedAt: new Date(),
		})
		.returning();

	const [payment] = await testDb
		.insert(payments)
		.values({
			reservationId: reservation.id,
			stripePaymentIntentId: `pi_test_${reservation.id}`,
			amount: totalAmount,
			currency: 'EUR',
			status: 'succeeded',
			idempotencyKey: `test-ik-${reservation.id}`,
		})
		.returning();

	// Link payment back to reservation
	await testDb
		.update(reservations)
		.set({ paymentId: payment.id })
		.where(eq(reservations.id, reservation.id));

	return { reservation, payment };
}

/**
 * Seed a pending reservation (no confirmed payment).
 */
async function seedPendingReservation(sessionId: string, overrides?: { quantity?: number; totalAmount?: number }) {
	const quantity = overrides?.quantity ?? 2;
	const totalAmount = overrides?.totalAmount ?? 5000;

	const accessToken = `test-atk-pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail: 'guest@example.com',
			guestName: 'Test Guest',
			quantity,
			totalAmount,
			currency: 'EUR',
			status: 'pending',
			accessToken,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
		})
		.returning();

	const [payment] = await testDb
		.insert(payments)
		.values({
			reservationId: reservation.id,
			stripePaymentIntentId: `pi_test_pending_${reservation.id}`,
			amount: totalAmount,
			currency: 'EUR',
			status: 'pending',
			idempotencyKey: `test-ik-pending-${reservation.id}`,
		})
		.returning();

	// Link payment back to reservation
	await testDb
		.update(reservations)
		.set({ paymentId: payment.id })
		.where(eq(reservations.id, reservation.id));

	return { reservation, payment };
}

// ---------------------------------------------------------------------------
// cancelReservationWithRefund tests
// ---------------------------------------------------------------------------

describe('cancelReservationWithRefund', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — reservation cancelled, payment refunded, capacity restored', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });
		const { reservation, payment } = await seedConfirmedReservation(session.id, { quantity: 2 });

		// Reduce availableCapacity to simulate consumed seats
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 88 })
			.where(eq(eventSessions.id, session.id));

		await cancelReservationWithRefund(reservation.id);

		// Stripe refund called with the correct payment intent
		expect(vi.mocked(createRefund)).toHaveBeenCalledWith(payment.stripePaymentIntentId);

		// Reservation status
		const [updatedRes] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(updatedRes.status).toBe('cancelled');
		expect(updatedRes.cancelledAt).toBeInstanceOf(Date);

		// Payment status
		const [updatedPay] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.reservationId, reservation.id));
		expect(updatedPay.status).toBe('refunded');

		// Capacity restored by quantity (2)
		const [updatedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(updatedSession.availableCapacity).toBe(90); // 88 + 2
	});

	it('non-confirmed reservation — throws; capacity unchanged', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });
		const { reservation } = await seedPendingReservation(session.id, { quantity: 3 });

		await expect(cancelReservationWithRefund(reservation.id)).rejects.toThrow(
			'Only confirmed reservations can be cancelled'
		);

		// Capacity must not have changed
		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(90);

		// Reservation status must remain pending and cancelledAt must remain null
		const [res] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(res.status).toBe('pending');
		expect(res.cancelledAt).toBeNull();
	});

	it('missing payment record — throws when no Payment row exists', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });

		// Create a confirmed reservation WITHOUT a payment record
		const accessToken = `test-atk-nopay-${Date.now()}`;
		const [reservation] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: session.id,
				guestEmail: 'guest@example.com',
				guestName: 'Test Guest',
				quantity: 2,
				totalAmount: 5000,
				currency: 'EUR',
				status: 'confirmed',
				accessToken,
				expiresAt: new Date(Date.now() + 15 * 60 * 1000),
				confirmedAt: new Date(),
			})
			.returning();

		await expect(cancelReservationWithRefund(reservation.id)).rejects.toThrow(
			'Payment not found for this reservation'
		);

		// Capacity unchanged
		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(90);
	});
});

// ---------------------------------------------------------------------------
// expireReservation tests
// ---------------------------------------------------------------------------

describe('expireReservation', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — reservation expired, capacity restored', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });
		const { reservation } = await seedPendingReservation(session.id, { quantity: 2 });

		// Simulate consumed capacity
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 88 })
			.where(eq(eventSessions.id, session.id));

		await expireReservation(reservation.id);

		// Reservation status
		const [updatedRes] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(updatedRes.status).toBe('expired');

		// Capacity restored by quantity (2)
		const [updatedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(updatedSession.availableCapacity).toBe(90); // 88 + 2
	});

	it('idempotency — calling twice does not double-restore capacity', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });
		const { reservation } = await seedPendingReservation(session.id, { quantity: 3 });

		// Simulate consumed capacity
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 87 })
			.where(eq(eventSessions.id, session.id));

		// First call
		await expireReservation(reservation.id);

		const [afterFirst] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(afterFirst.availableCapacity).toBe(90); // 87 + 3

		// Second call
		await expireReservation(reservation.id);

		const [afterSecond] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		// Capacity after two calls must equal capacity after one call
		expect(afterSecond.availableCapacity).toBe(afterFirst.availableCapacity);
	});

	it('already expired — completes without error, capacity unchanged', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });

		// Seed a reservation already in the expired state (never pending in this test)
		const [reservation] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: session.id,
				guestEmail: 'guest@example.com',
				guestName: 'Test Guest',
				quantity: 2,
				totalAmount: 5000,
				currency: 'EUR',
				status: 'expired',
				accessToken: `test-atk-expired-${Date.now()}`,
				expiresAt: new Date(Date.now() - 60_000),
			})
			.returning();

		// Should complete without throwing
		await expect(expireReservation(reservation.id)).resolves.toBeUndefined();

		// Capacity must remain untouched — nothing was ever consumed by this reservation
		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(90);

		// Status must remain expired
		const [updatedRes] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(updatedRes.status).toBe('expired');
	});

	it('confirmed reservation — no-op, status and capacity unchanged', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 88 });
		const { reservation } = await seedConfirmedReservation(session.id, { quantity: 2 });

		// Should complete without throwing
		await expect(expireReservation(reservation.id)).resolves.toBeUndefined();

		// Capacity must remain untouched
		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(88);

		// Reservation must remain confirmed
		const [res] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(res.status).toBe('confirmed');
	});
});

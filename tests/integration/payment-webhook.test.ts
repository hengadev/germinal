// @vitest-environment node
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

// ---------------------------------------------------------------------------
// Single postgres client shared between the mocked db and test assertions.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
//
// 1. email — mocked so no real SES / email-queue calls happen.
// 2. sms  — mocked so no real SMS calls happen.
// 3. db   — replaced with the fixture's test-scoped drizzle instance backed
//           by germinal_test.
// 4. env  — provides test-safe values so no real secrets are needed.
// ---------------------------------------------------------------------------

const sendTicketConfirmationEmailMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/lib/server/services/email', () => ({
	sendTicketConfirmationEmail: sendTicketConfirmationEmailMock,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendTicketConfirmationSMS: vi.fn().mockResolvedValue(undefined),
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

let handlePaymentSuccess: Awaited<
	typeof import('../../src/lib/server/services/payments')
>['handlePaymentSuccess'];
let handlePaymentFailure: Awaited<
	typeof import('../../src/lib/server/services/payments')
>['handlePaymentFailure'];

beforeAll(async () => {
	const mod = await import('../../src/lib/server/services/payments');
	handlePaymentSuccess = mod.handlePaymentSuccess;
	handlePaymentFailure = mod.handlePaymentFailure;
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
			titleEn: 'Webhook Test Event',
			titleFr: 'Événement Test Webhook',
			slug: `test-event-wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
 * Seed a pending reservation with an associated Payment row holding a known
 * `stripePaymentIntentId`.  This mirrors the state left behind by
 * `createReservation` before the Stripe webhook fires.
 */
async function seedPendingReservationWithPayment(
	sessionId: string,
	paymentIntentId: string,
	overrides?: { quantity?: number; totalAmount?: number; guestEmail?: string; guestPhone?: string },
) {
	const quantity = overrides?.quantity ?? 2;
	const totalAmount = overrides?.totalAmount ?? 5000;
	const guestEmail = overrides?.guestEmail ?? 'guest@example.com';
	const guestPhone = overrides?.guestPhone ?? null;

	const accessToken = `test-atk-wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail,
			guestName: 'Test Guest',
			guestPhone,
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
			stripePaymentIntentId: paymentIntentId,
			amount: totalAmount,
			currency: 'EUR',
			status: 'pending',
			idempotencyKey: `test-ik-wh-${reservation.id}`,
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
 * Build a minimal Stripe PaymentIntent-like object that satisfies the
 * `Stripe.PaymentIntent` contract used by the handlers.
 */
function fakePaymentIntent(
	id: string,
	overrides?: { last_payment_error?: { message: string } | null; status?: string },
) {
	return {
		id,
		object: 'payment_intent' as const,
		amount: 5000,
		currency: 'eur',
		status: 'succeeded' as const,
		latest_charge: null,
		...overrides,
	} as any;
}

// ---------------------------------------------------------------------------
// handlePaymentSuccess tests
// ---------------------------------------------------------------------------

describe('handlePaymentSuccess', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — reservation confirmed, payment updated, email sent', async () => {
		const { session } = await seedPublishedSession();
		const piId = `pi_test_success_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithPayment(
			session.id,
			piId,
			{ guestEmail: 'happy@example.com' },
		);

		await handlePaymentSuccess(fakePaymentIntent(piId));

		// Reservation status
		const [updatedRes] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(updatedRes.status).toBe('confirmed');
		expect(updatedRes.confirmedAt).toBeInstanceOf(Date);

		// Payment status
		const [updatedPay] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.id, payment.id));
		expect(updatedPay.status).toBe('succeeded');
		expect(updatedPay.webhookProcessedAt).toBeInstanceOf(Date);

		// Email was sent with correct guest email and access token
		expect(sendTicketConfirmationEmailMock).toHaveBeenCalledOnce();
		const callArgs = sendTicketConfirmationEmailMock.mock.calls[0][0];
		expect(callArgs.guestEmail).toBe('happy@example.com');
		expect(callArgs.accessToken).toBe(reservation.accessToken);
	});

	it('idempotency — second call is a no-op, no duplicate email', async () => {
		const { session } = await seedPublishedSession();
		const piId = `pi_test_idem_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithPayment(
			session.id,
			piId,
		);

		// First call
		await handlePaymentSuccess(fakePaymentIntent(piId));

		// Capture state after first call
		const [resAfterFirst] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		const [payAfterFirst] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.id, payment.id));
		expect(resAfterFirst.status).toBe('confirmed');
		expect(sendTicketConfirmationEmailMock).toHaveBeenCalledOnce();

		// Second call with the same PaymentIntent
		await handlePaymentSuccess(fakePaymentIntent(piId));

		// Reservation and Payment must be unchanged
		const [resAfterSecond] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		const [payAfterSecond] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.id, payment.id));
		expect(resAfterSecond.status).toBe('confirmed');
		expect(resAfterSecond.confirmedAt).toEqual(resAfterFirst.confirmedAt);
		expect(payAfterSecond.webhookProcessedAt).toEqual(payAfterFirst.webhookProcessedAt);

		// Email mock called exactly once across both invocations
		expect(sendTicketConfirmationEmailMock).toHaveBeenCalledOnce();
	});

	it('unknown PaymentIntent — handler returns without error, nothing modified', async () => {
		const { session } = await seedPublishedSession();
		const { reservation, payment } = await seedPendingReservationWithPayment(
			session.id,
			`pi_known_${Date.now()}`,
		);

		// Call with a PaymentIntent ID that does not exist in the DB
		await expect(
			handlePaymentSuccess(fakePaymentIntent('pi_unknown_999')),
		).resolves.toBeUndefined();

		// Reservation must still be pending
		const [unchangedRes] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(unchangedRes.status).toBe('pending');

		// Payment must still be pending
		const [unchangedPay] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.id, payment.id));
		expect(unchangedPay.status).toBe('pending');

		// No email sent
		expect(sendTicketConfirmationEmailMock).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// handlePaymentFailure tests
// ---------------------------------------------------------------------------

describe('handlePaymentFailure', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — payment failed, lastError populated, reservation expired, capacity restored', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });
		const piId = `pi_test_fail_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithPayment(
			session.id,
			piId,
			{ quantity: 2 },
		);

		// Simulate consumed capacity
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 88 })
			.where(eq(eventSessions.id, session.id));

		const pi = fakePaymentIntent(piId, {
			last_payment_error: { message: 'Your card was declined.' },
			status: 'requires_payment_method',
		});

		await handlePaymentFailure(pi);

		// Payment status
		const [updatedPay] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.id, payment.id));
		expect(updatedPay.status).toBe('failed');
		expect(updatedPay.lastError).toBe('Your card was declined.');

		// Reservation expired
		const [updatedRes] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(updatedRes.status).toBe('expired');

		// Capacity restored
		const [updatedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(updatedSession.availableCapacity).toBe(90); // 88 + 2
	});

	it('unknown PaymentIntent — handler returns without error', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });
		const { reservation, payment } = await seedPendingReservationWithPayment(
			session.id,
			`pi_known_fail_${Date.now()}`,
		);

		// Simulate consumed capacity
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 88 })
			.where(eq(eventSessions.id, session.id));

		// Call with a PaymentIntent ID that does not exist in the DB
		await expect(
			handlePaymentFailure(
				fakePaymentIntent('pi_unknown_fail_999', {
					last_payment_error: { message: 'Card declined.' },
					status: 'requires_payment_method',
				}),
			),
		).resolves.toBeUndefined();

		// Nothing changed
		const [unchangedRes] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, reservation.id));
		expect(unchangedRes.status).toBe('pending');

		const [unchangedPay] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.id, payment.id));
		expect(unchangedPay.status).toBe('pending');

		// Capacity unchanged
		const [unchangedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchangedSession.availableCapacity).toBe(88);
	});

	it('idempotency — second call does not double-restore capacity', async () => {
		const { session } = await seedPublishedSession({ availableCapacity: 90 });
		const piId = `pi_test_fail_idem_${Date.now()}`;
		await seedPendingReservationWithPayment(session.id, piId, { quantity: 2 });

		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 88 })
			.where(eq(eventSessions.id, session.id));

		const pi = fakePaymentIntent(piId, {
			last_payment_error: { message: 'Your card was declined.' },
			status: 'requires_payment_method',
		});

		await handlePaymentFailure(pi);
		await handlePaymentFailure(pi);

		const [updatedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(updatedSession.availableCapacity).toBe(90); // restored once, not twice
	});
});

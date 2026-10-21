// @vitest-environment node
//
// Issue 013 — a Reservation is confirmed only by a *paid*, *still-pending*
// Checkout Session. Integration tests against a real test database, with
// Stripe mocked at the service boundary (prior art: payment-webhook.test.ts).
// Events are delivered through the real webhook route where the dispatch
// itself matters (the async events), and straight to the service elsewhere.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

// ---------------------------------------------------------------------------
// Single postgres client shared between the mocked db and test assertions.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
//
// 1. email / sms — mocked so no real SES / SMS calls happen.
// 2. stripe     — mocked at the service boundary: deliveries arrive as plain
//                 JSON ("signature verification" just parses them), and the
//                 refund call is observable.
// 3. db         — replaced with the fixture's test-scoped drizzle instance.
// 4. env        — provides test-safe values so no real secrets are needed.
// ---------------------------------------------------------------------------

const sendTicketConfirmationEmailMock = vi.fn().mockResolvedValue(undefined);
const sendRefundEmailMock = vi.fn().mockResolvedValue(undefined);
const createRefundMock = vi.fn().mockResolvedValue({
	id: 're_test_mock',
	amount: 5000,
	status: 'succeeded',
});

vi.mock('../../src/lib/server/services/email', () => ({
	sendTicketConfirmationEmail: sendTicketConfirmationEmailMock,
	sendRefundEmail: sendRefundEmailMock,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendTicketConfirmationSMS: vi.fn().mockResolvedValue(undefined),
	sendRefundSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/stripe', () => ({
	verifyWebhookSignature: (payload: string) => JSON.parse(payload),
	createRefund: createRefundMock,
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
	cancelPaymentIntent: vi.fn().mockResolvedValue(undefined),
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

let POST: Awaited<typeof import('../../src/routes/api/webhooks/stripe/+server')>['POST'];
let handleCheckoutSuccess: Awaited<
	typeof import('../../src/lib/server/services/payments')
>['handleCheckoutSuccess'];

beforeAll(async () => {
	const route = await import('../../src/routes/api/webhooks/stripe/+server');
	POST = route.POST;
	const mod = await import('../../src/lib/server/services/payments');
	handleCheckoutSuccess = mod.handleCheckoutSuccess;
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
			titleEn: 'Confirmation Test Event',
			titleFr: 'Événement Test Confirmation',
			descriptionEn: 'Test description',
			descriptionFr: 'Description test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Test Location',
			locationFr: 'Lieu Test',
			visibility: 'public',
		})
		.returning();

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(
				testDb,
				event.id,
				overrides?.startTime ?? new Date('2099-06-01T18:00:00Z'),
				overrides?.endTime ?? new Date('2099-06-01T22:00:00Z')
			),
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime: new Date('2099-06-01T18:00:00Z'),
			endTime: new Date('2099-06-01T22:00:00Z'),
			totalCapacity: 100,
			availableCapacity: 100,
			published: true,
			...overrides,
		})
		.returning();

	return { event, session };
}

/**
 * Seed a pending reservation whose payment still holds the Checkout Session
 * id as its placeholder identifier — the state `createReservation` leaves
 * behind before the webhook fires.
 */
async function seedPendingReservationWithCheckoutSession(
	sessionId: string,
	checkoutSessionId: string,
	overrides?: { quantity?: number; depositAmount?: number; guestEmail?: string }
) {
	const quantity = overrides?.quantity ?? 2;
	const depositAmount = overrides?.depositAmount ?? 5000;
	const guestEmail = overrides?.guestEmail ?? 'guest@example.com';

	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail,
			guestName: 'Test Guest',
			quantity,
			totalAmount: depositAmount,
			depositAmount,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'pending',
			accessToken: `test-atk-cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
		})
		.returning();

	const [payment] = await testDb
		.insert(payments)
		.values({
			reservationId: reservation.id,
			stripePaymentIntentId: checkoutSessionId, // placeholder until the webhook swaps it
			amount: depositAmount,
			currency: 'EUR',
			status: 'pending',
			idempotencyKey: `test-ik-cc-${reservation.id}`,
		})
		.returning();

	await testDb
		.update(reservations)
		.set({ paymentId: payment.id })
		.where(eq(reservations.id, reservation.id));

	return { reservation, payment };
}

/** Build a minimal Checkout Session the handlers' contract is satisfied by. */
function fakeCheckoutSession(
	id: string,
	overrides?: { payment_status?: string; payment_intent?: string | null }
) {
	return {
		id,
		object: 'checkout_session' as const,
		payment_status: 'paid' as const,
		payment_intent: `pi_real_for_${id}`,
		...overrides,
	} as any;
}

/** Deliver a Stripe event through the real webhook route. */
async function deliver(type: string, object: unknown) {
	const request = new Request('http://localhost/api/webhooks/stripe', {
		method: 'POST',
		headers: { 'stripe-signature': 't=1,v1=test' },
		body: JSON.stringify({ id: `evt_${type}`, type, data: { object } }),
	});
	return POST({ request } as any);
}

async function loadReservation(id: string) {
	const [row] = await testDb.select().from(reservations).where(eq(reservations.id, id));
	return row;
}

async function loadPayment(id: string) {
	const [row] = await testDb.select().from(payments).where(eq(payments.id, id));
	return row;
}

async function loadSession(id: string) {
	const [row] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, id));
	return row;
}

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

describe('checkout.session.completed', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('a paid session confirms the pending Reservation, records the payment succeeded with its real PaymentIntent id, and sends one Ticket notification', async () => {
		const { session } = await seedPublishedSession();
		const csId = `cs_test_paid_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithCheckoutSession(
			session.id,
			csId,
			{ guestEmail: 'paid@example.com' }
		);

		const response = await deliver(
			'checkout.session.completed',
			fakeCheckoutSession(csId, { payment_intent: `pi_real_${csId}` })
		);
		expect(response.status).toBe(200);

		const updatedRes = await loadReservation(reservation.id);
		expect(updatedRes.status).toBe('confirmed');
		expect(updatedRes.confirmedAt).toBeInstanceOf(Date);

		const updatedPay = await loadPayment(payment.id);
		expect(updatedPay.status).toBe('succeeded');
		expect(updatedPay.stripePaymentIntentId).toBe(`pi_real_${csId}`);
		expect(updatedPay.webhookProcessedAt).toBeInstanceOf(Date);

		// One Ticket notification, to the right Guest
		expect(sendTicketConfirmationEmailMock).toHaveBeenCalledOnce();
		const callArgs = sendTicketConfirmationEmailMock.mock.calls[0][0];
		expect(callArgs.guestEmail).toBe('paid@example.com');
		expect(callArgs.accessToken).toBe(reservation.accessToken);

		// A confirmation moves no money and no capacity
		expect(createRefundMock).not.toHaveBeenCalled();
		expect((await loadSession(session.id)).availableCapacity).toBe(100);
	});

	it.each(['unpaid', 'processing'])(
		'a %s session confirms nothing',
		async (paymentStatus) => {
			const { session } = await seedPublishedSession();
			const csId = `cs_test_${paymentStatus}_${Date.now()}`;
			const { reservation, payment } = await seedPendingReservationWithCheckoutSession(
				session.id,
				csId
			);

			const response = await deliver(
				'checkout.session.completed',
				fakeCheckoutSession(csId, { payment_status: paymentStatus })
			);
			expect(response.status).toBe(200);

			expect((await loadReservation(reservation.id)).status).toBe('pending');
			const updatedPay = await loadPayment(payment.id);
			expect(updatedPay.status).toBe('pending');
			expect(updatedPay.webhookProcessedAt).toBeNull();
			expect(sendTicketConfirmationEmailMock).not.toHaveBeenCalled();
			expect(createRefundMock).not.toHaveBeenCalled();
		}
	);
});

// ---------------------------------------------------------------------------
// Async outcomes of delayed payment methods
// ---------------------------------------------------------------------------

describe('async payment outcomes', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('checkout.session.async_payment_succeeded confirms like a paid completion', async () => {
		const { session } = await seedPublishedSession();
		const csId = `cs_test_async_ok_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithCheckoutSession(
			session.id,
			csId
		);

		const response = await deliver(
			'checkout.session.async_payment_succeeded',
			fakeCheckoutSession(csId)
		);
		expect(response.status).toBe(200);

		expect((await loadReservation(reservation.id)).status).toBe('confirmed');
		const updatedPay = await loadPayment(payment.id);
		expect(updatedPay.status).toBe('succeeded');
		expect(updatedPay.stripePaymentIntentId).toBe(`pi_real_for_${csId}`);
		expect(sendTicketConfirmationEmailMock).toHaveBeenCalledOnce();
	});

	it('checkout.session.async_payment_failed expires the Reservation and restores capacity', async () => {
		const { session } = await seedPublishedSession();
		const csId = `cs_test_async_fail_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithCheckoutSession(
			session.id,
			csId,
			{ quantity: 2 }
		);
		// The two seats are held while the payment is pending
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 98 })
			.where(eq(eventSessions.id, session.id));

		const response = await deliver(
			'checkout.session.async_payment_failed',
			fakeCheckoutSession(csId)
		);
		expect(response.status).toBe(200);

		expect((await loadReservation(reservation.id)).status).toBe('expired');
		expect((await loadSession(session.id)).availableCapacity).toBe(100); // restored once
		const updatedPay = await loadPayment(payment.id);
		expect(updatedPay.status).toBe('failed');
		expect(updatedPay.webhookProcessedAt).toBeInstanceOf(Date);
		expect(sendTicketConfirmationEmailMock).not.toHaveBeenCalled();
	});

	it('an async failure for a Reservation the expiry job already expired restores nothing', async () => {
		const { session } = await seedPublishedSession();
		const csId = `cs_test_async_fail_late_${Date.now()}`;
		const { reservation } = await seedPendingReservationWithCheckoutSession(session.id, csId, {
			quantity: 2,
		});
		// The expiry job already expired it and released its two seats; other
		// Guests hold 10 more, so a second restore would show (capacity is
		// capped at the total).
		await testDb
			.update(reservations)
			.set({ status: 'expired', updatedAt: new Date() })
			.where(eq(reservations.id, reservation.id));
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 90 })
			.where(eq(eventSessions.id, session.id));

		const response = await deliver(
			'checkout.session.async_payment_failed',
			fakeCheckoutSession(csId)
		);
		expect(response.status).toBe(200);

		expect((await loadReservation(reservation.id)).status).toBe('expired');
		expect((await loadSession(session.id)).availableCapacity).toBe(90);
	});
});

// ---------------------------------------------------------------------------
// A paid session arriving after the hold expired
// ---------------------------------------------------------------------------

describe('late payment', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('a paid session for an expired Reservation refunds once and touches nothing else', async () => {
		const { session } = await seedPublishedSession();
		const csId = `cs_test_late_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithCheckoutSession(
			session.id,
			csId,
			{ guestEmail: 'late@example.com' }
		);
		// The state the expiry job leaves behind: hold gone, seats released,
		// payment marked failed.
		await testDb
			.update(reservations)
			.set({ status: 'expired', updatedAt: new Date() })
			.where(eq(reservations.id, reservation.id));
		await testDb
			.update(payments)
			.set({ status: 'failed', lastError: 'Reservation expired', updatedAt: new Date() })
			.where(eq(payments.id, payment.id));

		const response = await deliver(
			'checkout.session.completed',
			fakeCheckoutSession(csId, { payment_intent: `pi_late_${csId}` })
		);
		expect(response.status).toBe(200);

		// One full refund, carrying an idempotency key derived from the payment
		expect(createRefundMock).toHaveBeenCalledOnce();
		expect(createRefundMock).toHaveBeenCalledWith(`pi_late_${csId}`, 5000, {
			idempotencyKey: `late-payment-refund-${payment.id}`,
		});

		// The payment is marked refunded, correlatable with the real PI id
		const updatedPay = await loadPayment(payment.id);
		expect(updatedPay.status).toBe('refunded');
		expect(updatedPay.refundedAmount).toBe(5000);
		expect(updatedPay.stripePaymentIntentId).toBe(`pi_late_${csId}`);

		// The Reservation stays expired and the capacity stays released
		expect((await loadReservation(reservation.id)).status).toBe('expired');
		expect((await loadSession(session.id)).availableCapacity).toBe(100);

		// The Guest gets the refund notification, never a Ticket
		expect(sendRefundEmailMock).toHaveBeenCalledOnce();
		expect(sendRefundEmailMock.mock.calls[0][0].guestEmail).toBe('late@example.com');
		expect(sendTicketConfirmationEmailMock).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Duplicate deliveries of the same event
// ---------------------------------------------------------------------------

describe('duplicate deliveries', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('two concurrent deliveries of the same paid session confirm once and send one Ticket', async () => {
		const { session } = await seedPublishedSession();
		const csId = `cs_test_concurrent_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithCheckoutSession(
			session.id,
			csId
		);

		const checkoutSession = fakeCheckoutSession(csId);
		const [first, second] = await Promise.all([
			handleCheckoutSuccess(checkoutSession),
			handleCheckoutSuccess(checkoutSession),
		]);
		expect([first, second]).toHaveLength(2); // neither threw

		const updatedRes = await loadReservation(reservation.id);
		expect(updatedRes.status).toBe('confirmed');
		expect(updatedRes.confirmedAt).toBeInstanceOf(Date);

		const updatedPay = await loadPayment(payment.id);
		expect(updatedPay.status).toBe('succeeded');

		// Exactly one Ticket for the Guest, and no refund for a confirmation
		expect(sendTicketConfirmationEmailMock).toHaveBeenCalledOnce();
		expect(createRefundMock).not.toHaveBeenCalled();
	});

	it('a delivery repeated after the confirmation is a no-op', async () => {
		const { session } = await seedPublishedSession();
		const csId = `cs_test_repeat_${Date.now()}`;
		const { reservation, payment } = await seedPendingReservationWithCheckoutSession(
			session.id,
			csId
		);

		const checkoutSession = fakeCheckoutSession(csId);
		await handleCheckoutSuccess(checkoutSession);
		const afterFirst = await loadPayment(payment.id);
		await handleCheckoutSuccess(checkoutSession);

		expect((await loadReservation(reservation.id)).status).toBe('confirmed');
		const afterSecond = await loadPayment(payment.id);
		expect(afterSecond.webhookProcessedAt).toEqual(afterFirst.webhookProcessedAt);
		expect(sendTicketConfirmationEmailMock).toHaveBeenCalledOnce();
		expect(createRefundMock).not.toHaveBeenCalled();
	});
});

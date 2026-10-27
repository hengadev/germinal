// @vitest-environment node
//
// Issue 014 — the expiry job closes the Stripe side of an expired
// Reservation's payment, so a Checkout Session can't be paid after its hold
// is gone. Integration tests against a real test database; the Stripe SDK
// itself is faked, so the real Stripe service decides which object to close.
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

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Fake Stripe SDK: the calls the expiry job makes are observable, and each
// can be made to fail. Error classes are Stripe's own.
// ---------------------------------------------------------------------------

const stripeApi = vi.hoisted(() => ({
	expireSession: vi.fn(),
	retrieveSession: vi.fn(),
	cancelIntent: vi.fn(),
	retrieveIntent: vi.fn(),
	createRefund: vi.fn(),
}));

vi.mock('stripe', async (importOriginal) => {
	const actual = (await importOriginal()) as { default: { errors: unknown } };
	class FakeStripe {
		static errors = actual.default.errors;
		checkout = { sessions: { expire: stripeApi.expireSession, retrieve: stripeApi.retrieveSession } };
		paymentIntents = { cancel: stripeApi.cancelIntent, retrieve: stripeApi.retrieveIntent };
		refunds = { create: stripeApi.createRefund };
	}
	return { default: FakeStripe };
});

const { default: RealStripe } = await vi.importActual<typeof import('stripe')>('stripe');
const invalidRequest = (message: string) =>
	new RealStripe.errors.StripeInvalidRequestError({ message, type: 'invalid_request_error' } as any);
const connectionError = () =>
	new RealStripe.errors.StripeConnectionError({ message: 'connect ECONNREFUSED', type: 'api_connection_error' } as any);

vi.mock('../../src/lib/server/services/email', () => ({
	sendTicketConfirmationEmail: vi.fn().mockResolvedValue(undefined),
	sendRefundEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/lib/server/services/sms', () => ({
	sendTicketConfirmationSMS: vi.fn().mockResolvedValue(undefined),
	sendRefundSMS: vi.fn().mockResolvedValue(undefined),
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
	isBrevoConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

let cleanupExpiredReservations: Awaited<
	typeof import('../../src/lib/server/jobs/cleanup-expired-reservations')
>['cleanupExpiredReservations'];
let expireReservation: Awaited<typeof import('../../src/lib/server/services/reservations')>['expireReservation'];
let handleCheckoutSuccess: Awaited<typeof import('../../src/lib/server/services/payments')>['handleCheckoutSuccess'];

beforeAll(async () => {
	({ cleanupExpiredReservations } = await import('../../src/lib/server/jobs/cleanup-expired-reservations'));
	({ expireReservation } = await import('../../src/lib/server/services/reservations'));
	({ handleCheckoutSuccess } = await import('../../src/lib/server/services/payments'));
});

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	vi.clearAllMocks();
	stripeApi.expireSession.mockResolvedValue({ status: 'expired' });
	stripeApi.cancelIntent.mockResolvedValue({ status: 'canceled' });
	stripeApi.createRefund.mockResolvedValue({ id: 're_test', amount: 5000, status: 'succeeded' });
	await setupTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A published Seating with 100 seats, `held` of them taken by the Reservation under test. */
async function seedSeating(held: number) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Expiry Test Event',
			titleFr: 'Événement Test Expiration',
			descriptionEn: 'Test description',
			descriptionFr: 'Description test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Test Location',
			locationFr: 'Lieu Test',
			visibility: 'public',
		})
		.returning();

	const startTime = new Date('2099-06-01T18:00:00Z');
	const endTime = new Date('2099-06-01T22:00:00Z');
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, endTime),
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime,
			endTime,
			totalCapacity: 100,
			availableCapacity: 100 - held,
			published: true,
		})
		.returning();
	return seating;
}

/** A pending Reservation of 2 seats whose hold ran out, its payment under `stripeId`. */
async function seedLapsedReservation(seatingId: string, stripeId: string) {
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: seatingId,
			guestEmail: 'guest@example.com',
			guestName: 'Test Guest',
			quantity: 2,
			totalAmount: 5000,
			depositAmount: 5000,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'pending',
			accessToken: `test-atk-exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			expiresAt: new Date(Date.now() - 60_000),
		})
		.returning();

	const [payment] = await testDb
		.insert(payments)
		.values({
			reservationId: reservation.id,
			stripePaymentIntentId: stripeId,
			amount: 5000,
			currency: 'EUR',
			status: 'pending',
			idempotencyKey: `test-ik-exp-${reservation.id}`,
		})
		.returning();

	await testDb.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, reservation.id));
	return { reservation, payment };
}

const load = {
	reservation: async (id: string) =>
		(await testDb.select().from(reservations).where(eq(reservations.id, id)))[0],
	payment: async (id: string) => (await testDb.select().from(payments).where(eq(payments.id, id)))[0],
	seating: async (id: string) =>
		(await testDb.select().from(eventSessions).where(eq(eventSessions.id, id)))[0],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expiry job closes the Stripe side', () => {
	it('expires the Checkout Session when the payment holds a Checkout Session id', async () => {
		const seating = await seedSeating(2);
		const { reservation, payment } = await seedLapsedReservation(seating.id, 'cs_test_open');

		await cleanupExpiredReservations();

		expect(stripeApi.expireSession).toHaveBeenCalledExactlyOnceWith('cs_test_open');
		expect(stripeApi.cancelIntent).not.toHaveBeenCalled();
		expect((await load.reservation(reservation.id)).status).toBe('expired');
		expect((await load.seating(seating.id)).availableCapacity).toBe(100);
		expect((await load.payment(payment.id)).status).toBe('failed');
	});

	it('cancels the PaymentIntent when the payment holds a PaymentIntent id', async () => {
		const seating = await seedSeating(2);
		const { payment } = await seedLapsedReservation(seating.id, 'pi_test_open');

		await cleanupExpiredReservations();

		expect(stripeApi.cancelIntent).toHaveBeenCalledExactlyOnceWith('pi_test_open');
		expect(stripeApi.expireSession).not.toHaveBeenCalled();
		expect((await load.payment(payment.id)).status).toBe('failed');
	});

	it('treats an already-terminal Checkout Session or PaymentIntent as closed', async () => {
		const seating = await seedSeating(4);
		const session = await seedLapsedReservation(seating.id, 'cs_test_done');
		const intent = await seedLapsedReservation(seating.id, 'pi_test_done');
		stripeApi.expireSession.mockRejectedValue(invalidRequest('Only open sessions can be expired'));
		stripeApi.retrieveSession.mockResolvedValue({ id: 'cs_test_done', status: 'expired' });
		stripeApi.cancelIntent.mockRejectedValue(invalidRequest('PaymentIntent is already canceled'));
		stripeApi.retrieveIntent.mockResolvedValue({ id: 'pi_test_done', status: 'canceled' });

		const result = await cleanupExpiredReservations();

		expect(result.errors).toEqual([]);
		expect((await load.payment(session.payment.id)).status).toBe('failed');
		expect((await load.payment(intent.payment.id)).status).toBe('failed');
	});

	it('still expires when Stripe is unreachable, and the next run retries closing only the Stripe side', async () => {
		const seating = await seedSeating(2);
		const { reservation, payment } = await seedLapsedReservation(seating.id, 'cs_test_flaky');
		stripeApi.expireSession.mockRejectedValueOnce(connectionError());

		const first = await cleanupExpiredReservations();

		expect(first.errors).toHaveLength(1);
		expect((await load.reservation(reservation.id)).status).toBe('expired');
		expect((await load.seating(seating.id)).availableCapacity).toBe(100);
		expect((await load.payment(payment.id)).status).toBe('pending'); // Stripe side still open

		await cleanupExpiredReservations();

		expect(stripeApi.expireSession).toHaveBeenCalledTimes(2);
		expect((await load.payment(payment.id)).status).toBe('failed');
		// Expiry ran once: capacity was not restored a second time.
		expect((await load.seating(seating.id)).availableCapacity).toBe(100);
	});

	it('expiry racing a webhook confirmation: exactly one wins, capacity restored only if expiry won', async () => {
		for (let round = 0; round < 5; round++) {
			await setupTestDatabase();
			const seating = await seedSeating(2);
			const csId = `cs_test_race_${round}`;
			const { reservation, payment } = await seedLapsedReservation(seating.id, csId);

			await Promise.all([
				expireReservation(reservation.id),
				handleCheckoutSuccess({
					id: csId,
					object: 'checkout_session',
					payment_status: 'paid',
					payment_intent: `pi_paid_${round}`,
				} as any),
			]);

			const status = (await load.reservation(reservation.id)).status;
			const capacity = (await load.seating(seating.id)).availableCapacity;
			if (status === 'confirmed') {
				expect(capacity, `round ${round}`).toBe(98);
				expect((await load.payment(payment.id)).status).toBe('succeeded');
			} else {
				expect(status, `round ${round}`).toBe('expired');
				expect(capacity, `round ${round}`).toBe(100);
				// The payment that lost the race is refunded, not confirmed.
				expect((await load.payment(payment.id)).status).toBe('refunded');
			}
		}
	}, 30_000);
});

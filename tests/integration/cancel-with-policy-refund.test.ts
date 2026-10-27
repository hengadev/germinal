// @vitest-environment node
//
// Issue 028 — cancelling with the refund the Event's Refund Policy gives:
// the admin cancel screen's pre-fill and confirmation (guest-requested or
// Germinal-initiated), and the guest's self-service cancellation of a
// rule-based Event.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { events, eventSessions, reservations, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import { createRefund } from '../../src/lib/server/services/stripe';
import type { RefundTier } from '../../src/lib/utils/refund-policy';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn(),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
	// Stripe refunds exactly what it is asked to.
	createRefund: vi.fn(async (_paymentIntentId: string, amount?: number) => ({
		id: 're_test_mock',
		amount: amount ?? 0,
		status: 'succeeded',
	})),
}));

const notifications = vi.hoisted(() => ({
	sendRefundEmail: vi.fn().mockResolvedValue(undefined),
	sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
	sendRefundSMS: vi.fn().mockResolvedValue(undefined),
	sendCancellationSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/email', () => ({
	sendRefundEmail: notifications.sendRefundEmail,
	sendCancellationEmail: notifications.sendCancellationEmail,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendRefundSMS: notifications.sendRefundSMS,
	sendCancellationSMS: notifications.sendCancellationSMS,
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

type CancellationModule = typeof import('../../src/lib/server/services/cancellation');
let cancellation: CancellationModule;

beforeAll(async () => {
	cancellation = await import('../../src/lib/server/services/cancellation');
});

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	vi.clearAllMocks();
	// Stripe refunds exactly what it is asked to (tests may override this).
	vi.mocked(createRefund).mockImplementation(async (_paymentIntentId, amount) => ({
		id: 're_test_mock',
		amount: amount ?? 0,
		status: 'succeeded',
	}) as any);
	await setupTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const NOW = new Date('2099-06-01T08:00:00Z');
const TIERED: RefundTier[] = [
	{ hoursBefore: 48, percent: 100 },
	{ hoursBefore: 24, percent: 50 },
];
const MANUAL_TEXT_FR = 'Vous pouvez annuler jusqu’à 24 h avant votre séance. Passé ce délai, contactez-nous.';

/** An Event with a Refund Policy and a Seating starting `hoursAhead` after NOW. */
async function seedSeating(options: { policy: 'rules' | 'manual'; hoursAhead: number; tiers?: RefundTier[] }) {
	const startTime = new Date(NOW.getTime() + options.hoursAhead * HOUR);
	const endTime = new Date(startTime.getTime() + 3 * HOUR);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Policy Event',
			titleFr: 'Événement politique',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: startTime,
			endDate: endTime,
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			refundPolicyType: options.policy,
			refundPolicyTextEn: options.policy === 'manual' ? 'Contact us.' : null,
			refundPolicyTextFr: options.policy === 'manual' ? MANUAL_TEXT_FR : null,
			refundPolicyTiers: options.policy === 'rules' ? (options.tiers ?? TIERED) : [],
		})
		.returning();

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, endTime),
			startTime,
			endTime,
			totalCapacity: 20,
			availableCapacity: 18,
			published: true,
		})
		.returning();
	return { event, session };
}

/** A confirmed Reservation of 2 seats; a Deposit paid online unless 0. */
async function seedReservation(sessionId: string, options: { deposit: number; total?: number; refunded?: number }) {
	const total = options.total ?? 8000;
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail: 'guest@example.com',
			guestName: 'Test Guest',
			quantity: 2,
			totalAmount: total,
			depositAmount: options.deposit,
			balanceAmount: total - options.deposit,
			currency: 'EUR',
			status: 'confirmed',
			accessToken: `atk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			expiresAt: new Date(NOW.getTime() + 15 * 60_000),
			confirmedAt: NOW,
		})
		.returning();

	if (options.deposit === 0) return { reservation, payment: null };

	const refunded = options.refunded ?? 0;
	const [payment] = await testDb
		.insert(payments)
		.values({
			reservationId: reservation.id,
			stripePaymentIntentId: `pi_test_${reservation.id}`,
			amount: options.deposit,
			refundedAmount: refunded,
			currency: 'EUR',
			status: refunded > 0 ? 'partially_refunded' : 'succeeded',
			idempotencyKey: `ik-${reservation.id}`,
		})
		.returning();
	await testDb.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, reservation.id));
	return { reservation, payment };
}

async function stateOf(reservationId: string, paymentId: string | null, sessionId: string) {
	const reservation = await testDb.query.reservations.findFirst({ where: eq(reservations.id, reservationId) });
	const payment = paymentId ? await testDb.query.payments.findFirst({ where: eq(payments.id, paymentId) }) : null;
	const session = await testDb.query.eventSessions.findFirst({ where: eq(eventSessions.id, sessionId) });
	return { reservation: reservation!, payment, session: session! };
}

// ---------------------------------------------------------------------------
// Admin cancel screen
// ---------------------------------------------------------------------------

describe('admin cancellation — pre-fill', () => {
	it('suggests the tier refund with its reason, and the full Deposit for Germinal', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation } = await seedReservation(session.id, { deposit: 4000 });

		const quote = await cancellation.getCancellationQuote(reservation.id, NOW);

		expect(quote.refundable).toBe(4000);
		expect(quote.policyType).toBe('rules');
		expect(quote.suggestedAmount).toBe(2000);
		expect(quote.suggestedReasonFr).toBe('Palier appliqué : 50\u00a0% jusqu’à 24\u00a0h avant la séance — il reste 31\u00a0h');
		expect(quote.germinalAmount).toBe(4000);
		expect(quote.germinalReasonFr).toBe('Annulé par Germinal : remboursement intégral de l’acompte');
	});

	it('manual policy: no suggestion, the policy text instead', async () => {
		const { session } = await seedSeating({ policy: 'manual', hoursAhead: 31 });
		const { reservation } = await seedReservation(session.id, { deposit: 4000 });

		const quote = await cancellation.getCancellationQuote(reservation.id, NOW);

		expect(quote.policyType).toBe('manual');
		expect(quote.suggestedAmount).toBeNull();
		expect(quote.policyTextFr).toBe(MANUAL_TEXT_FR);
		expect(quote.germinalAmount).toBe(4000);
	});

	it('applies the policy to what is left after an earlier refund', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation } = await seedReservation(session.id, { deposit: 4000, refunded: 1000 });

		const quote = await cancellation.getCancellationQuote(reservation.id, NOW);

		expect(quote.refundable).toBe(3000);
		expect(quote.suggestedAmount).toBe(1500);
	});
});

describe('admin cancellation — confirm', () => {
	it('pre-filled partial refund: half the Deposit refunded, Reservation cancelled, seats released', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		const result = await cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'guest', now: NOW });

		expect(result).toMatchObject({ cancelledBy: 'guest', suggestedAmount: 2000, appliedAmount: 2000, refundable: 4000 });
		expect(createRefund).toHaveBeenCalledWith(payment!.stripePaymentIntentId, 2000, { idempotencyKey: expect.any(String) });
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.reservation.cancelledAt).not.toBeNull();
		expect(state.payment!.status).toBe('partially_refunded');
		expect(state.payment!.refundedAmount).toBe(2000);
		expect(state.session.availableCapacity).toBe(20);
	});

	it('Germinal cancellation refunds the full Deposit whatever amount is sent', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 3 }); // too late for the policy
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		const result = await cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'germinal', amount: 100, now: NOW });

		expect(result).toMatchObject({ cancelledBy: 'germinal', suggestedAmount: 4000, appliedAmount: 4000 });
		expect(createRefund).toHaveBeenCalledWith(payment!.stripePaymentIntentId, 4000, { idempotencyKey: expect.any(String) });
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.payment!.status).toBe('refunded');
		expect(state.payment!.refundedAmount).toBe(4000);
	});

	it('an edited amount is respected', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		// Goodwill: more than the 50 % suggested.
		const result = await cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'guest', amount: 3500, now: NOW });

		expect(result).toMatchObject({ suggestedAmount: 2000, appliedAmount: 3500 });
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.payment!.refundedAmount).toBe(3500);
		expect(state.reservation.status).toBe('cancelled');
	});

	it('an amount above the refundable Deposit is refused and nothing changes', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		await expect(
			cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'guest', amount: 4001, now: NOW })
		).rejects.toThrow(cancellation.CancellationError);

		expect(createRefund).not.toHaveBeenCalled();
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('confirmed');
		expect(state.payment!.refundedAmount).toBe(0);
		expect(state.session.availableCapacity).toBe(18);
	});

	it('zero: cancels and releases the seats without refunding', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		await cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'guest', amount: 0, now: NOW });

		expect(createRefund).not.toHaveBeenCalled();
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.payment!.status).toBe('succeeded');
		expect(state.session.availableCapacity).toBe(20);
	});

	it('manual policy: the Admin must type the amount', async () => {
		const { session } = await seedSeating({ policy: 'manual', hoursAhead: 31 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		await expect(
			cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'guest', now: NOW })
		).rejects.toThrow(/montant/);

		const result = await cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'guest', amount: 1234, now: NOW });
		expect(result).toMatchObject({ suggestedAmount: null, appliedAmount: 1234 });
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.payment!.refundedAmount).toBe(1234);
	});

	it('no Deposit: cancels without any refund', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 100 });
		const { reservation } = await seedReservation(session.id, { deposit: 0 });

		const result = await cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'germinal', now: NOW });

		expect(result).toMatchObject({ refundable: 0, appliedAmount: 0 });
		expect(createRefund).not.toHaveBeenCalled();
		const state = await stateOf(reservation.id, null, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.session.availableCapacity).toBe(20);
	});

	it('an already-cancelled Reservation is refused', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation } = await seedReservation(session.id, { deposit: 4000 });
		await cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'guest', now: NOW });

		await expect(
			cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'germinal', now: NOW })
		).rejects.toThrow('Cette réservation est déjà annulée');
		expect(createRefund).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// Guest self-service cancellation
// ---------------------------------------------------------------------------

describe('guest self-service cancellation', () => {
	it('rule-based policy: refunds the policy amount after the commit, with an idempotency key', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 31 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		const terms = await cancellation.getGuestCancellationTerms(reservation.id, NOW);
		expect(terms).toMatchObject({ canCancel: true, mode: 'policy', refundAmount: 2000, currency: 'EUR' });

		const result = await cancellation.cancelByGuest(reservation.id, NOW);

		expect(result).toEqual({ refundAmount: 2000, currency: 'EUR' });
		expect(createRefund).toHaveBeenCalledWith(payment!.stripePaymentIntentId, 2000, {
			idempotencyKey: `guest-cancel-refund-${reservation.id}`,
		});
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.payment!.refundedAmount).toBe(2000);
		expect(state.payment!.status).toBe('partially_refunded');
		expect(state.session.availableCapacity).toBe(20);
		expect(notifications.sendRefundEmail).toHaveBeenCalledOnce();
	});

	it('rule-based policy, too late for a refund: still cancels, releases the seats and notifies', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 3 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		const result = await cancellation.cancelByGuest(reservation.id, NOW);

		expect(result.refundAmount).toBe(0);
		expect(createRefund).not.toHaveBeenCalled();
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.payment!.status).toBe('succeeded');
		expect(state.session.availableCapacity).toBe(20);
		expect(notifications.sendCancellationEmail).toHaveBeenCalledOnce();
	});

	it('manual policy: the historical 24-hour full-refund rule', async () => {
		const { session } = await seedSeating({ policy: 'manual', hoursAhead: 31 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		expect(await cancellation.getGuestCancellationTerms(reservation.id, NOW)).toMatchObject({
			canCancel: true,
			mode: 'full-refund',
			refundAmount: 4000,
		});
		expect(await cancellation.cancelByGuest(reservation.id, NOW)).toEqual({ refundAmount: 4000, currency: 'EUR' });
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.payment!.status).toBe('refunded');
		expect(state.session.availableCapacity).toBe(20);
	});

	it('once the Seating has started: refused', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: -1 });
		const { reservation } = await seedReservation(session.id, { deposit: 4000 });

		await expect(cancellation.cancelByGuest(reservation.id, NOW)).rejects.toThrow(
			'The seating has already started'
		);
		const state = await stateOf(reservation.id, null, session.id);
		expect(state.reservation.status).toBe('confirmed');
	});

	it.each(['manual', 'rules'] as const)(
		'%s policy: five concurrent cancels restore capacity once, refund once and notify once',
		async (policy) => {
			const { session } = await seedSeating({ policy, hoursAhead: 72 });
			const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });
			// While Stripe is called, no Seating row lock may be held: a NOWAIT
			// lock attempt from another connection must succeed.
			vi.mocked(createRefund).mockImplementation(async (_pi, amount) => {
				await testDb.execute(sql`SELECT 1 FROM event_sessions WHERE id = ${session.id} FOR UPDATE NOWAIT`);
				return { id: 're_test_mock', amount: amount ?? 0, status: 'succeeded' } as any;
			});

			const results = await Promise.allSettled(
				Array.from({ length: 5 }, () => cancellation.cancelByGuest(reservation.id, NOW))
			);

			expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
			for (const refused of results.filter((r) => r.status === 'rejected')) {
				expect((refused as PromiseRejectedResult).reason).toBeInstanceOf(cancellation.CancellationError);
			}
			const state = await stateOf(reservation.id, payment!.id, session.id);
			expect(state.reservation.status).toBe('cancelled');
			expect(state.session.availableCapacity).toBe(20); // 18 + 2, once
			expect(createRefund).toHaveBeenCalledOnce();
			expect(state.payment!.refundedAmount).toBe(4000);
			expect(notifications.sendRefundEmail).toHaveBeenCalledOnce();
			expect(notifications.sendCancellationEmail).not.toHaveBeenCalled();
		}
	);

	it('a Stripe refund failure still leaves the Reservation cancelled, capacity restored once', async () => {
		const { session } = await seedSeating({ policy: 'manual', hoursAhead: 72 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });
		vi.mocked(createRefund).mockRejectedValueOnce(new Error('Stripe is down'));

		const result = await cancellation.cancelByGuest(reservation.id, NOW);

		expect(result.refundAmount).toBe(0);
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.session.availableCapacity).toBe(20);
		expect(state.payment!.status).toBe('succeeded');
		expect(state.payment!.refundedAmount).toBe(0);
		expect(state.payment!.lastError).toMatch(/Stripe is down/);
		// No refund went through: the guest gets the plain cancellation notice.
		expect(notifications.sendCancellationEmail).toHaveBeenCalledOnce();
		expect(notifications.sendRefundEmail).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Issue 016 — Admin cancel and refund go through the Reservation transitions
// ---------------------------------------------------------------------------

describe('Admin cancellation through the Reservation transitions', () => {
	async function settle(calls: Promise<unknown>[]) {
		const results = await Promise.allSettled(calls);
		return results.filter((r) => r.status === 'fulfilled').length;
	}

	it('two concurrent Admin cancels (detail page) cancel once, restore capacity once and refund once', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 72 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		const won = await settle([
			cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'germinal', now: NOW }),
			cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'germinal', now: NOW }),
		]);

		expect(won).toBe(1);
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.session.availableCapacity).toBe(20);
		expect(createRefund).toHaveBeenCalledOnce();
		expect(state.payment!.refundedAmount).toBe(4000);
		expect(notifications.sendRefundEmail).toHaveBeenCalledOnce();
	});

	it('two concurrent Admin API cancels cancel once, restore capacity once and refund once', async () => {
		const { cancelReservationWithRefund } = await import('../../src/lib/server/services/reservations');
		const { session } = await seedSeating({ policy: 'manual', hoursAhead: 72 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		const won = await settle([cancelReservationWithRefund(reservation.id), cancelReservationWithRefund(reservation.id)]);

		expect(won).toBe(1);
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.session.availableCapacity).toBe(20);
		expect(createRefund).toHaveBeenCalledOnce();
		expect(state.payment!.status).toBe('refunded');
	});

	it('an Admin cancel racing a Guest cancel: exactly one wins', async () => {
		const { session } = await seedSeating({ policy: 'manual', hoursAhead: 72 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });

		const won = await settle([
			cancellation.cancelWithRefund(reservation.id, { cancelledBy: 'germinal', now: NOW }),
			cancellation.cancelByGuest(reservation.id, NOW),
		]);

		expect(won).toBe(1);
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.reservation.status).toBe('cancelled');
		expect(state.session.availableCapacity).toBe(20);
		expect(createRefund).toHaveBeenCalledOnce();
		expect(state.payment!.refundedAmount).toBe(4000);
	});

	it('a double-submitted partial refund of a cancelled Reservation refunds once', async () => {
		const { session } = await seedSeating({ policy: 'rules', hoursAhead: 72 });
		const { reservation, payment } = await seedReservation(session.id, { deposit: 4000 });
		const { processRefund } = await import('../../src/lib/server/services/reservations');
		await processRefund(reservation.id, 1000);
		vi.mocked(createRefund).mockClear();

		await settle([processRefund(reservation.id, 500), processRefund(reservation.id, 500)]);

		// Same state, same idempotency key: Stripe answers both calls with
		// one refund, and the payment records it once.
		expect(new Set(vi.mocked(createRefund).mock.calls.map((call) => call[2]?.idempotencyKey)).size).toBe(1);
		const state = await stateOf(reservation.id, payment!.id, session.id);
		expect(state.payment!.refundedAmount).toBe(1500);
		expect(state.session.availableCapacity).toBe(20);
	});
});

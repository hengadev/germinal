// @vitest-environment node
//
// Issue 065 — paying the Deposit with a gift card: full cover (no Stripe,
// confirmed at once), partial cover (Stripe charges only the rest), the
// card's share credited back on expiry, on failed payment and on a
// cancellation with refund, unusable codes refused, and two concurrent
// bookings on one card never overspending it.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, payments, reservations } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockImplementation(() =>
		Promise.resolve({
			id: `cs_test_mock_checkout_session_${crypto.randomUUID()}`,
			url: 'https://checkout.stripe.test/mock',
		})
	),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
	// Stripe refunds exactly what it is asked to.
	createRefund: vi.fn(async (_paymentIntentId: string, amount?: number) => ({
		id: 're_test_mock',
		amount: amount ?? 0,
		status: 'succeeded',
	})),
}));

vi.mock('../../src/lib/server/services/ticket-notifications', () => ({
	sendTicketNotifications: vi.fn().mockResolvedValue(undefined),
}));

const notifications = vi.hoisted(() => ({
	sendRefundEmail: vi.fn().mockResolvedValue(undefined),
	sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/email', () => ({
	sendRefundEmail: notifications.sendRefundEmail,
	sendCancellationEmail: notifications.sendCancellationEmail,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendRefundSMS: vi.fn().mockResolvedValue(undefined),
	sendCancellationSMS: vi.fn().mockResolvedValue(undefined),
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

type ReservationsModule = typeof import('../../src/lib/server/services/reservations');
type GiftCardsModule = typeof import('../../src/lib/server/services/gift-cards');
type TransitionsModule = typeof import('../../src/lib/server/services/reservation-transitions');
type CancellationModule = typeof import('../../src/lib/server/services/cancellation');
let svc: ReservationsModule;
let giftCards: GiftCardsModule;
let transitions: TransitionsModule;
let cancellation: CancellationModule;

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	vi.clearAllMocks();
	svc = await import('../../src/lib/server/services/reservations');
	giftCards = await import('../../src/lib/server/services/gift-cards');
	transitions = await import('../../src/lib/server/services/reservation-transitions');
	cancellation = await import('../../src/lib/server/services/cancellation');
	await setupTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A published Event whose Deposit is a fixed €25 per booking, one Seating
 * at €25 a seat, and a 100 % Refund Policy (tiers), so a cancellation
 * refunds everything. */
async function seedSession(overrides?: Partial<typeof events.$inferInsert>) {
	const startTime = new Date('2099-06-01T18:00:00Z');
	const endTime = new Date('2099-06-01T22:00:00Z');
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Gift Event',
			titleFr: 'Événement cadeau',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			depositType: 'fixed',
			depositValue: 2500,
			refundPolicyType: 'rules',
			refundPolicyTiers: [{ hoursBefore: 24, percent: 100 }],
			...overrides,
		})
		.returning();

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, endTime, { priceAmount: 2500 }),
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime,
			endTime,
			totalCapacity: 100,
			availableCapacity: 100,
			published: true,
		})
		.returning();
	return { event, session };
}

function makeInput(sessionId: string, giftCardCode?: string) {
	return {
		sessionId,
		email: 'guest@example.com',
		name: 'Test Guest',
		quantity: 1,
		giftCardCode,
	};
}

/** A card's live balance, for the assertions. */
async function balanceOf(cardId: string) {
	const card = await giftCards.getGiftCard(cardId);
	return card!.card.balance;
}

/** Confirm a pending Reservation the way the paid webhook does. */
async function confirmPayment(reservationId: string) {
	const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, reservationId));
	const outcome = await transitions.confirmReservationForPayment({
		reservationId,
		paymentId: payment.id,
		paymentIntentId: `pi_test_${reservationId}`,
	});
	expect(outcome.won).toBe(true);
	// Link the Reservation to its Payment, the way the webhook does.
	await testDb.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, reservationId));
	return payment;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReservation with a gift card', () => {
	it('full cover — no Stripe, confirmed at once, redemption recorded', async () => {
		const { session } = await seedSession();
		const card = await giftCards.issueGiftCard({ amount: 2500 });

		const result = await svc.createReservation(makeInput(session.id, card.code));

		expect(result.checkoutUrl).toBeNull();
		expect(result.reservation.status).toBe('confirmed');
		expect(result.reservation.giftCardAmount).toBe(2500);
		// The card paid the whole Deposit: no Payment row at all.
		const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, result.reservation.id));
		expect(payment).toBeUndefined();
		expect(await balanceOf(card.id)).toBe(0);
		const ledger = (await giftCards.getGiftCard(card.id))!.ledger;
		expect(ledger).toHaveLength(1);
		expect(ledger[0].amount).toBe(-2500);
		expect(ledger[0].reason).toBe('booking');
		expect(ledger[0].reservationId).toBe(result.reservation.id);
	});

	it('partial cover — Stripe charges only the rest', async () => {
		const { session } = await seedSession();
		const card = await giftCards.issueGiftCard({ amount: 1000 });

		const result = await svc.createReservation(makeInput(session.id, card.code));

		expect(result.checkoutUrl).toBe('https://checkout.stripe.test/mock');
		expect(result.reservation.status).toBe('pending');
		expect(result.reservation.giftCardAmount).toBe(1000);
		const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, result.reservation.id));
		expect(payment.amount).toBe(1500);
		expect(await balanceOf(card.id)).toBe(0);
	});

	it('unusable codes are refused with their reason, and nothing is booked', async () => {
		const { session } = await seedSession();

		const unknown = await svc.createReservation(makeInput(session.id, 'GERM-ZZZZ-ZZZZ'.replaceAll('Z', '9'))).catch((e) => e);
		expect(unknown).toBeInstanceOf(svc.GiftCardUnusableError);
		expect(unknown.reason).toBe('unknown');

		const expired = await giftCards.issueGiftCard({ amount: 1000, expiresAt: new Date(Date.now() - 1000) });
		const refused = await svc.createReservation(makeInput(session.id, expired.code)).catch((e) => e);
		expect(refused).toBeInstanceOf(svc.GiftCardUnusableError);
		expect(refused.reason).toBe('expired');

		const empty = await giftCards.issueGiftCard({ amount: 1000 });
		await giftCards.redeemGiftCard(empty.code, { amount: 1000, reason: 'door' });
		const drained = await svc.createReservation(makeInput(session.id, empty.code)).catch((e) => e);
		expect(drained).toBeInstanceOf(svc.GiftCardUnusableError);
		expect(drained.reason).toBe('empty');

		// None of the refusals booked anything.
		const booked = await testDb.select().from(reservations).where(eq(reservations.eventSessionId, session.id));
		expect(booked).toHaveLength(0);
		const [seating] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, session.id));
		expect(seating.availableCapacity).toBe(100);
	});

	it('two concurrent bookings on one card never overspend it', async () => {
		const { session } = await seedSession();
		// A €30 card cannot pay a €25 Deposit twice.
		const card = await giftCards.issueGiftCard({ amount: 3000 });

		const results = await Promise.allSettled([
			svc.createReservation(makeInput(session.id, card.code)),
			svc.createReservation(makeInput(session.id, card.code)),
		]);

		// However the race resolves, the card is never overspent: the ledger
		// never goes below -€30. (Both bookings may even succeed: the loser of
		// the card's row lock re-reads the balance and redeems only what is
		// left, €5 here.)
		const ledger = (await giftCards.getGiftCard(card.id))!.ledger;
		const redeemed = ledger.filter((l) => l.reason === 'booking').reduce((sum, l) => sum + l.amount, 0);
		expect(redeemed).toBeGreaterThanOrEqual(-3000);
		expect(await balanceOf(card.id)).toBe(3000 + redeemed);
		for (const r of results) {
			if (r.status !== 'fulfilled') continue;
			expect(r.value.reservation.giftCardAmount).toBeLessThanOrEqual(2500);
		}
		// Whatever was redeemed is recorded on its own Reservation.
		const booked = await testDb.select().from(reservations).where(eq(reservations.eventSessionId, session.id));
		expect(booked).toHaveLength(results.filter((r) => r.status === 'fulfilled').length);
		expect(booked.reduce((sum, r) => sum + r.giftCardAmount, 0)).toBe(-redeemed);
	});
});

describe('the card share is credited back', () => {
	it('when the hold expires — once, however often the job runs', async () => {
		const { session } = await seedSession();
		const card = await giftCards.issueGiftCard({ amount: 1000 });
		const result = await svc.createReservation(makeInput(session.id, card.code));

		const first = await transitions.expireReservationOnHoldTimeout(result.reservation.id);
		expect(first.won).toBe(true);
		expect(await balanceOf(card.id)).toBe(1000);

		// A repeated expiry credits nothing more.
		const second = await transitions.expireReservationOnHoldTimeout(result.reservation.id);
		expect(second.won).toBe(false);
		expect(await balanceOf(card.id)).toBe(1000);
	});

	it('when the payment fails', async () => {
		const { session } = await seedSession();
		const card = await giftCards.issueGiftCard({ amount: 1000 });
		const result = await svc.createReservation(makeInput(session.id, card.code));
		const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, result.reservation.id));

		const outcome = await transitions.expireReservationForFailedPayment({
			reservationId: result.reservation.id,
			paymentId: payment.id,
			lastError: 'card_declined',
		});
		expect(outcome.won).toBe(true);
		expect(await balanceOf(card.id)).toBe(1000);
	});

	it('on a cancellation with refund — card first, Stripe only its share', async () => {
		const { session } = await seedSession();
		const card = await giftCards.issueGiftCard({ amount: 1000 });
		const result = await svc.createReservation(makeInput(session.id, card.code));
		const payment = await confirmPayment(result.reservation.id);

		const { createRefund } = await import('../../src/lib/server/services/stripe');
		vi.mocked(createRefund).mockClear();

		const outcome = await cancellation.cancelWithRefund(result.reservation.id, {
			cancelledBy: 'germinal',
			now: new Date('2099-05-30T08:00:00Z'),
		});

		// The whole €25 Deposit is refunded: €10 to the card, €15 by Stripe.
		expect(outcome.appliedAmount).toBe(2500);
		expect(await balanceOf(card.id)).toBe(1000);
		expect(vi.mocked(createRefund)).toHaveBeenCalledWith(
			`pi_test_${result.reservation.id}`,
			1500,
			expect.objectContaining({ idempotencyKey: expect.stringContaining('refund-') })
		);
		const [refundedPayment] = await testDb.select().from(payments).where(eq(payments.id, payment.id));
		expect(refundedPayment.refundedAmount).toBe(1500);
	});

	it('on a cancellation of a Reservation fully paid by card — no Payment row needed', async () => {
		const { session } = await seedSession();
		const card = await giftCards.issueGiftCard({ amount: 2500 });
		const result = await svc.createReservation(makeInput(session.id, card.code));
		expect(result.reservation.status).toBe('confirmed');

		const outcome = await cancellation.cancelWithRefund(result.reservation.id, {
			cancelledBy: 'germinal',
			now: new Date('2099-05-30T08:00:00Z'),
		});

		expect(outcome.appliedAmount).toBe(2500);
		expect(await balanceOf(card.id)).toBe(2500);
		const { createRefund } = await import('../../src/lib/server/services/stripe');
		expect(vi.mocked(createRefund)).not.toHaveBeenCalled();
	});
});

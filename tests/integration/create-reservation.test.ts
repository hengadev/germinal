// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventServices, eventSessions, reservations, payments, coupons, promotionCodes } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import type { CreateReservationInput } from '../../src/lib/types/reservations';

// ---------------------------------------------------------------------------
// Single postgres client shared between the mocked db and test assertions.
// Using the fixture singleton avoids leaking connections.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
//
// 1. Stripe — mocked at the service boundary so no real HTTP calls happen.
// 2. db    — the lazy singleton in src/lib/server/db/index.ts is replaced with
//            the fixture's test-scoped drizzle instance backed by germinal_test.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout_session',
		url: 'https://checkout.stripe.test/mock',
	}),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
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

afterAll(async () => {
	await closeTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A published Event with one Seating. Seatings are booked at their
 * Service's price (issue 022): `servicePrice` sets it (default €25.00,
 * `priceAmount: null` leaves the Service unpriced).
 */
async function seedPublishedSession(
	overrides?: Partial<typeof eventSessions.$inferInsert>,
	servicePrice?: { priceAmount?: number | null; currency?: string }
) {
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

	const defaultStart = new Date('2099-06-01T18:00:00Z');
	const defaultEnd = new Date('2099-06-01T22:00:00Z');

	const startTime = overrides?.startTime ?? defaultStart;
	const endTime = overrides?.endTime ?? defaultEnd;
	const serviceId = await seedServiceForSession(testDb, event.id, startTime, endTime, servicePrice);

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId,
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime,
			endTime,
			totalCapacity: 100,
			availableCapacity: 100,
			published: true,
			...overrides,
		})
		.returning();

	return { event, session };
}

function makeInput(
	sessionId: string,
	overrides?: Partial<CreateReservationInput>
): CreateReservationInput {
	return {
		sessionId,
		email: 'guest@example.com',
		name: 'Test Guest',
		quantity: 1,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReservation', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — creates reservation, payment, decrements capacity, returns checkoutUrl', async () => {
		const { session } = await seedPublishedSession();
		const input = makeInput(session.id, { quantity: 2 });

		// Dynamic import so module-level mocks are in place before evaluation
		const { createReservation } = await import('../../src/lib/server/services/reservations');

		const result = await createReservation(input);

		// --- Return value checks ---
		expect(result.reservation).toBeDefined();
		expect(result.checkoutUrl).toBe('https://checkout.stripe.test/mock');
		expect(result.expiresAt).toBeInstanceOf(Date);

		// --- Reservation row ---
		const [reservation] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, result.reservation.id));
		expect(reservation).toBeDefined();
		expect(reservation.status).toBe('pending');
		expect(reservation.quantity).toBe(2);
		expect(reservation.totalAmount).toBe(5000); // Service price 2500 × 2
		expect(reservation.guestEmail).toBe('guest@example.com');

		// --- Payment row ---
		const [payment] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.reservationId, result.reservation.id));
		expect(payment).toBeDefined();
		expect(payment.status).toBe('pending');
		expect(payment.amount).toBe(5000);

		// --- Capacity decremented ---
		const [updatedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(updatedSession.availableCapacity).toBe(98); // 100 − 2
	});

	it('untitled Seating — Stripe Checkout gets the label derived from Day, Service and time', async () => {
		const { session } = await seedPublishedSession({ titleEn: null, titleFr: null });
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		await createReservation(makeInput(session.id));

		// Stripe rejects empty line-item names: an untitled Seating must
		// never send one.
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
			productName: 'Dinner — Monday, 1 June 2099, 18:00 — Test Event',
		}));
	});

	it('sold out — throws when availableCapacity < quantity; capacity unchanged', async () => {
		const { session } = await seedPublishedSession({
			totalCapacity: 5,
			availableCapacity: 1,
		});
		const input = makeInput(session.id, { quantity: 2 });

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow('Not enough tickets available');

		// Capacity should remain unchanged
		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(1);

		// No reservation should exist
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);
	});

	it('race condition — two concurrent calls for the last ticket; exactly one succeeds', async () => {
		const { session } = await seedPublishedSession({
			totalCapacity: 1,
			availableCapacity: 1,
		});

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		const input1 = makeInput(session.id, { email: 'guest1@example.com', name: 'Guest 1', quantity: 1 });
		const input2 = makeInput(session.id, { email: 'guest2@example.com', name: 'Guest 2', quantity: 1 });

		const results = await Promise.allSettled([
			createReservation(input1),
			createReservation(input2),
		]);

		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected');

		// Exactly one succeeds, one fails
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);

		// Capacity should be non-negative
		const [finalSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(finalSession.availableCapacity).toBeGreaterThanOrEqual(0);

		// Exactly one reservation was created
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(1);
	});

	it('session not published — throws when published flag is false', async () => {
		const { session } = await seedPublishedSession({ published: false });
		const input = makeInput(session.id);

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow('Session not found or not published');

		// No reservation created
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);
	});

	it('session already started — throws when startTime is in the past', async () => {
		const { session } = await seedPublishedSession({
			startTime: new Date('2020-01-01T10:00:00Z'),
			endTime: new Date('2020-01-01T14:00:00Z'),
		});
		const input = makeInput(session.id);

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow(
			'Cannot book tickets for a session that has already started'
		);

		// No reservation created
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);
	});

	it('Service price — the total is the Service price × quantity, in its currency, for Stripe too', async () => {
		const { session } = await seedPublishedSession({}, { priceAmount: 4200, currency: 'CHF' });
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const result = await createReservation(makeInput(session.id, { quantity: 3 }));

		const [reservation] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, result.reservation.id));
		expect(reservation.totalAmount).toBe(12600); // 4200 × 3
		expect(reservation.currency).toBe('CHF');

		const [payment] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.reservationId, result.reservation.id));
		expect(payment.amount).toBe(12600);
		expect(payment.currency).toBe('CHF');

		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
			amount: 12600,
			currency: 'CHF',
			quantity: 3,
		}));
	});

	it('Service price changed — a new Reservation uses the current Service price', async () => {
		const { session } = await seedPublishedSession();
		await testDb.update(eventServices)
			.set({ priceAmount: 3900 })
			.where(eq(eventServices.id, session.serviceId));
		const { createReservation } = await import('../../src/lib/server/services/reservations');

		const result = await createReservation(makeInput(session.id, { quantity: 2 }));

		expect(result.reservation.totalAmount).toBe(7800); // 3900 × 2
	});

	it('zero price — a free Service gives a zero total; capacity is still locked', async () => {
		const { session } = await seedPublishedSession({}, { priceAmount: 0 });
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const result = await createReservation(makeInput(session.id, { quantity: 2 }));

		const [reservation] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, result.reservation.id));
		expect(reservation.totalAmount).toBe(0);
		expect(reservation.discountAmount).toBe(0);
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 0 }));

		const [updatedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(updatedSession.availableCapacity).toBe(98);
	});

	it('legacy Seating price — a migrated Seating that kept its own price is booked at it', async () => {
		const { session } = await seedPublishedSession(
			{ legacyPriceAmount: 6000, legacyCurrency: 'EUR' },
			{ priceAmount: 2500 }
		);
		const { createReservation } = await import('../../src/lib/server/services/reservations');

		const result = await createReservation(makeInput(session.id, { quantity: 2 }));

		expect(result.reservation.totalAmount).toBe(12000); // 6000 × 2, not 2500 × 2
	});

	it('Service without a price — refused; no Reservation, capacity unchanged, no Stripe call', async () => {
		const { session } = await seedPublishedSession({}, { priceAmount: null });
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		await expect(createReservation(makeInput(session.id))).rejects.toThrow('Seating has no price yet');

		expect(await testDb.select().from(reservations)).toHaveLength(0);
		expect(createCheckoutSession).not.toHaveBeenCalled();
		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(100);
	});

	it('honeypot filled — throws when honeypot field is non-empty', async () => {
		const { session } = await seedPublishedSession();
		const input = makeInput(session.id, { honeypot: 'bot-fill' });

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow('Invalid submission');

		// No reservation created, capacity unchanged
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);

		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// Deposit (issue 023): checkout charges only the Deposit
// ---------------------------------------------------------------------------

describe('createReservation — Deposit', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	async function setDepositRule(eventId: string, depositType: 'none' | 'fixed' | 'percent', depositValue: number) {
		await testDb.update(events).set({ depositType, depositValue }).where(eq(events.id, eventId));
	}

	async function seedPromoCode(eventId: string, code: string, discountType: 'percent' | 'amount', discountValue: number) {
		const [coupon] = await testDb
			.insert(coupons)
			.values({ eventId, name: code, discountType, discountValue, active: true })
			.returning();
		await testDb.insert(promotionCodes).values({ couponId: coupon.id, code, active: true });
	}

	async function storedRows(reservationId: string) {
		const [reservation] = await testDb.select().from(reservations).where(eq(reservations.id, reservationId));
		const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, reservationId));
		return { reservation, payment };
	}

	it('an Event with the default rule (full payment) is charged the whole total, as before', async () => {
		const { event, session } = await seedPublishedSession();
		expect(event.depositType).toBe('percent');
		expect(event.depositValue).toBe(100);
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const result = await createReservation(makeInput(session.id, { quantity: 2 }));

		const { reservation, payment } = await storedRows(result.reservation.id);
		expect(reservation).toMatchObject({ totalAmount: 5000, depositAmount: 5000, balanceAmount: 0 });
		expect(payment.amount).toBe(5000);
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
			amount: 5000,
			productName: 'General Admission — Test Event',
		}));
	});

	it('a percentage Deposit — Stripe is asked for the Deposit only; the Balance is stored', async () => {
		const { event, session } = await seedPublishedSession({}, { priceAmount: 6500 });
		await setDepositRule(event.id, 'percent', 30);
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const result = await createReservation(makeInput(session.id, { quantity: 2 }));

		// 2 × 65 € = 130 €; Deposit 30 % = 39 €; Balance 91 €
		const { reservation, payment } = await storedRows(result.reservation.id);
		expect(reservation).toMatchObject({ totalAmount: 13000, discountAmount: 0, depositAmount: 3900, balanceAmount: 9100 });
		expect(payment.amount).toBe(3900);
		expect(createCheckoutSession).toHaveBeenCalledTimes(1);
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
			amount: 3900,
			currency: 'EUR',
			productName: 'Acompte / Deposit — General Admission — Test Event × 2',
		}));
	});

	it('a fixed Deposit per seat — charged per seat, capped at the total', async () => {
		const { event, session } = await seedPublishedSession({}, { priceAmount: 6500 });
		await setDepositRule(event.id, 'fixed', 2000);
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const result = await createReservation(makeInput(session.id, { quantity: 3 }));
		const { reservation, payment } = await storedRows(result.reservation.id);
		expect(reservation).toMatchObject({ totalAmount: 19500, depositAmount: 6000, balanceAmount: 13500 });
		expect(payment.amount).toBe(6000);
		expect(createCheckoutSession).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 6000 }));

		// A fixed Deposit above the price is capped at the total.
		await setDepositRule(event.id, 'fixed', 9000);
		vi.mocked(createCheckoutSession).mockResolvedValueOnce({
			id: 'cs_test_mock_checkout_session_2',
			url: 'https://checkout.stripe.test/mock',
		} as Awaited<ReturnType<typeof createCheckoutSession>>);
		const capped = await createReservation(makeInput(session.id, { quantity: 1, email: 'other@example.com' }));
		expect((await storedRows(capped.reservation.id)).reservation)
			.toMatchObject({ totalAmount: 6500, depositAmount: 6500, balanceAmount: 0 });
	});

	it('a Promo Code — the Deposit is worked out on the discounted total', async () => {
		const { event, session } = await seedPublishedSession({}, { priceAmount: 5000 });
		await setDepositRule(event.id, 'percent', 30);
		await seedPromoCode(event.id, 'TEN', 'percent', 10);
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const result = await createReservation(makeInput(session.id, { quantity: 2, promoCode: 'ten' }));

		// 100 € − 10 % = 90 €; Deposit 30 % = 27 €; Balance 63 €
		const { reservation, payment } = await storedRows(result.reservation.id);
		expect(reservation).toMatchObject({ totalAmount: 9000, discountAmount: 1000, depositAmount: 2700, balanceAmount: 6300 });
		expect(payment.amount).toBe(2700);
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 2700 }));
	});

	it('a comp Reservation has nothing to collect: no Deposit, no Balance', async () => {
		const { event, session } = await seedPublishedSession({}, { priceAmount: 6500 });
		await setDepositRule(event.id, 'percent', 30);
		const { createCompReservation } = await import('../../src/lib/server/services/reservations');

		const result = await createCompReservation({
			sessionId: session.id,
			email: 'vip@example.com',
			name: 'VIP Guest',
			quantity: 2,
		});

		expect((await storedRows(result.reservation.id)).reservation)
			.toMatchObject({ isComp: true, totalAmount: 0, depositAmount: 0, balanceAmount: 0 });
	});

	it('the database refuses a Deposit and Balance that do not add up to the total', async () => {
		const { session } = await seedPublishedSession();
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const result = await createReservation(makeInput(session.id));

		await expect(
			testDb.update(reservations).set({ balanceAmount: 100 }).where(eq(reservations.id, result.reservation.id))
		).rejects.toThrow();
	});

	it('the database refuses an invalid Deposit rule', async () => {
		const { event } = await seedPublishedSession();
		await expect(setDepositRule(event.id, 'percent', 0)).rejects.toThrow();
		await expect(setDepositRule(event.id, 'percent', 101)).rejects.toThrow();
		await expect(setDepositRule(event.id, 'none', 30)).rejects.toThrow();
		await expect(setDepositRule(event.id, 'fixed', 0)).rejects.toThrow();
	});
});

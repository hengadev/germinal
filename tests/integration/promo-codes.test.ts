// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, coupons, promotionCodes, reservations, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/services/stripe', () => ({
	createStripeCoupon: vi.fn(),
	createStripePromotionCode: vi.fn(),
	deactivateStripePromotionCode: vi.fn(),
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout_session',
		url: 'https://checkout.stripe.test/mock',
	}),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
}));

// Bookings confirmed without Stripe (a 100 % Promo Code) send the Ticket.
vi.mock('../../src/lib/server/services/ticket-notifications', () => ({
	sendTicketNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
	isStripeEnabled: () => false,
	isAWSConfigured: () => false,
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

async function seedEvent() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Promo Test Event',
			titleFr: 'Événement Test Promo',
			slug: `promo-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			published: true,
		})
		.returning();
	return event;
}

async function seedSession(
	eventId: string,
	overrides?: Partial<typeof eventSessions.$inferInsert>,
	servicePrice?: { priceAmount?: number | null; currency?: string }
) {
	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
			serviceId: await seedServiceForSession(
				testDb,
				eventId,
				overrides?.startTime ?? new Date('2099-06-01T18:00:00Z'),
				overrides?.endTime ?? new Date('2099-06-01T22:00:00Z'),
				servicePrice
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
	return session;
}

async function seedCoupon(eventId: string, overrides?: Partial<typeof coupons.$inferInsert>) {
	const [coupon] = await testDb
		.insert(coupons)
		.values({
			eventId,
			name: 'Test Coupon',
			discountType: 'percent',
			discountValue: 20,
			active: true,
			...overrides,
		})
		.returning();
	return coupon;
}

async function seedPromoCode(couponId: string, code: string, overrides?: Partial<typeof promotionCodes.$inferInsert>) {
	const [promoCode] = await testDb
		.insert(promotionCodes)
		.values({
			couponId,
			code,
			active: true,
			redemptionCount: 0,
			...overrides,
		})
		.returning();
	return promoCode;
}

// ---------------------------------------------------------------------------
// calculateDiscountAmount — pure function, no DB needed
// ---------------------------------------------------------------------------

describe('calculateDiscountAmount', () => {
	it('percent discount — rounds correctly', async () => {
		const { calculateDiscountAmount } = await import('../../src/lib/server/services/promo-codes');
		expect(calculateDiscountAmount('percent', 20, 5000)).toBe(1000); // 20% of €50 = €10
		expect(calculateDiscountAmount('percent', 10, 333)).toBe(33);    // rounds down
	});

	it('fixed amount discount — returns value directly', async () => {
		const { calculateDiscountAmount } = await import('../../src/lib/server/services/promo-codes');
		expect(calculateDiscountAmount('amount', 500, 5000)).toBe(500);
	});

	it('fixed amount capped at total — cannot exceed order total', async () => {
		const { calculateDiscountAmount } = await import('../../src/lib/server/services/promo-codes');
		expect(calculateDiscountAmount('amount', 9999, 500)).toBe(500);
	});
});

// ---------------------------------------------------------------------------
// validatePromoCode
// ---------------------------------------------------------------------------

describe('validatePromoCode', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('valid code — returns discount info', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id, { discountType: 'percent', discountValue: 25 });
		await seedPromoCode(coupon.id, 'SUMMER25');

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('SUMMER25', session.id);

		expect(result.valid).toBe(true);
		if (!result.valid) return;
		expect(result.discountType).toBe('percent');
		expect(result.discountValue).toBe(25);
	});

	it('case insensitive — normalises to uppercase', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id);
		await seedPromoCode(coupon.id, 'UPPER10');

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('upper10', session.id);

		expect(result.valid).toBe(true);
	});

	it('unknown code — returns invalid', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('DOESNOTEXIST', session.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/invalid promotion code/i);
	});

	it('wrong event — code belongs to a different event', async () => {
		const event1 = await seedEvent();
		const event2 = await seedEvent();
		const session2 = await seedSession(event2.id);
		const coupon1 = await seedCoupon(event1.id);
		await seedPromoCode(coupon1.id, 'EVENT1ONLY');

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('EVENT1ONLY', session2.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/not valid for this event/i);
	});

	it('inactive promo code — returns invalid', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id);
		await seedPromoCode(coupon.id, 'INACTIVE1', { active: false });

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('INACTIVE1', session.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/no longer active/i);
	});

	it('inactive coupon — returns invalid even if promo code is active', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id, { active: false });
		await seedPromoCode(coupon.id, 'INACTIVECOUPON');

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('INACTIVECOUPON', session.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/no longer active/i);
	});

	it('expired promo code — returns invalid', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id);
		await seedPromoCode(coupon.id, 'EXPIRED1', {
			expiresAt: new Date('2020-01-01T00:00:00Z'),
		});

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('EXPIRED1', session.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/expired/i);
	});

	it('expired coupon — returns invalid even if promo code has no expiry', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id, {
			expiresAt: new Date('2020-01-01T00:00:00Z'),
		});
		await seedPromoCode(coupon.id, 'EXPIREDCOUPON');

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('EXPIREDCOUPON', session.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/expired/i);
	});

	it('promo code redemption limit reached — returns invalid', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id);
		await seedPromoCode(coupon.id, 'MAXEDOUT', {
			maxRedemptions: 5,
			redemptionCount: 5,
		});

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('MAXEDOUT', session.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/usage limit/i);
	});

	it('coupon redemption limit reached — returns invalid even if promo code has room', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		const coupon = await seedCoupon(event.id, {
			maxRedemptions: 3,
			redemptionCount: 3,
		});
		await seedPromoCode(coupon.id, 'COUPONMAXED', {
			maxRedemptions: 10,
			redemptionCount: 0,
		});

		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('COUPONMAXED', session.id);

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/usage limit/i);
	});

	it('session not found — returns invalid', async () => {
		const { validatePromoCode } = await import('../../src/lib/server/services/promo-codes');
		const result = await validatePromoCode('ANYCODE', '00000000-0000-0000-0000-000000000000');

		expect(result.valid).toBe(false);
		if (result.valid) return;
		expect(result.error).toMatch(/session not found/i);
	});
});

// ---------------------------------------------------------------------------
// incrementRedemption
// ---------------------------------------------------------------------------

describe('incrementRedemption', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — increments both promo code and coupon counts', async () => {
		const event = await seedEvent();
		const coupon = await seedCoupon(event.id, { maxRedemptions: 10, redemptionCount: 2 });
		const promoCode = await seedPromoCode(coupon.id, 'INCREMENT1', {
			maxRedemptions: 5,
			redemptionCount: 1,
		});

		const { incrementRedemption } = await import('../../src/lib/server/services/promo-codes');
		await testDb.transaction(async (tx) => {
			await incrementRedemption(promoCode.id, tx);
		});

		const [updatedCode] = await testDb
			.select({ redemptionCount: promotionCodes.redemptionCount })
			.from(promotionCodes)
			.where(eq(promotionCodes.id, promoCode.id));
		expect(updatedCode.redemptionCount).toBe(2);

		const [updatedCoupon] = await testDb
			.select({ redemptionCount: coupons.redemptionCount })
			.from(coupons)
			.where(eq(coupons.id, coupon.id));
		expect(updatedCoupon.redemptionCount).toBe(3);
	});

	it('at limit — throws when promo code is already exhausted', async () => {
		const event = await seedEvent();
		const coupon = await seedCoupon(event.id);
		const promoCode = await seedPromoCode(coupon.id, 'ATCAP1', {
			maxRedemptions: 2,
			redemptionCount: 2,
		});

		const { incrementRedemption } = await import('../../src/lib/server/services/promo-codes');
		await expect(
			testDb.transaction(async (tx) => {
				await incrementRedemption(promoCode.id, tx);
			})
		).rejects.toThrow('Promotion code is no longer available');

		// Count must be unchanged after the failed transaction
		const [unchanged] = await testDb
			.select({ redemptionCount: promotionCodes.redemptionCount })
			.from(promotionCodes)
			.where(eq(promotionCodes.id, promoCode.id));
		expect(unchanged.redemptionCount).toBe(2);
	});

	it('coupon at limit — throws when coupon is exhausted even if promo code has room', async () => {
		const event = await seedEvent();
		const coupon = await seedCoupon(event.id, {
			maxRedemptions: 1,
			redemptionCount: 1,
		});
		const promoCode = await seedPromoCode(coupon.id, 'COUPONATCAP', {
			maxRedemptions: 10,
			redemptionCount: 0,
		});

		const { incrementRedemption } = await import('../../src/lib/server/services/promo-codes');
		await expect(
			testDb.transaction(async (tx) => {
				await incrementRedemption(promoCode.id, tx);
			})
		).rejects.toThrow('Promotion code is no longer available');
	});
});

// ---------------------------------------------------------------------------
// decrementRedemption
// ---------------------------------------------------------------------------

describe('decrementRedemption', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — decrements both promo code and coupon counts', async () => {
		const event = await seedEvent();
		const coupon = await seedCoupon(event.id, { redemptionCount: 3 });
		const promoCode = await seedPromoCode(coupon.id, 'DECREMENT1', {
			redemptionCount: 2,
		});

		const { decrementRedemption } = await import('../../src/lib/server/services/promo-codes');
		await decrementRedemption(promoCode.id);

		const [updatedCode] = await testDb
			.select({ redemptionCount: promotionCodes.redemptionCount })
			.from(promotionCodes)
			.where(eq(promotionCodes.id, promoCode.id));
		expect(updatedCode.redemptionCount).toBe(1);

		const [updatedCoupon] = await testDb
			.select({ redemptionCount: coupons.redemptionCount })
			.from(coupons)
			.where(eq(coupons.id, coupon.id));
		expect(updatedCoupon.redemptionCount).toBe(2);
	});

	it('floor at zero — never goes below 0', async () => {
		const event = await seedEvent();
		const coupon = await seedCoupon(event.id, { redemptionCount: 0 });
		const promoCode = await seedPromoCode(coupon.id, 'FLOOR1', {
			redemptionCount: 0,
		});

		const { decrementRedemption } = await import('../../src/lib/server/services/promo-codes');
		await decrementRedemption(promoCode.id);

		const [updatedCode] = await testDb
			.select({ redemptionCount: promotionCodes.redemptionCount })
			.from(promotionCodes)
			.where(eq(promotionCodes.id, promoCode.id));
		expect(updatedCode.redemptionCount).toBe(0);

		const [updatedCoupon] = await testDb
			.select({ redemptionCount: coupons.redemptionCount })
			.from(coupons)
			.where(eq(coupons.id, coupon.id));
		expect(updatedCoupon.redemptionCount).toBe(0);
	});

	it('missing promo code — returns without error', async () => {
		const { decrementRedemption } = await import('../../src/lib/server/services/promo-codes');
		await expect(
			decrementRedemption('00000000-0000-0000-0000-000000000000')
		).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Booking with a Promo Code (issue 026): the discount comes off the price of
// the meal; the Deposit is worked out on the discounted total.
// ---------------------------------------------------------------------------

describe('createReservation with a Promo Code', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	/** A published Event priced at `unitPrice` per seat with the given Deposit
	 * rule, and a Promo Code `code` for it. */
	async function seedBookable(opts: {
		unitPrice: number;
		deposit: { type: 'none' | 'fixed' | 'percent'; value: number };
		code: string;
		discountType: 'percent' | 'amount';
		discountValue: number;
	}) {
		const event = await seedEvent();
		await testDb
			.update(events)
			.set({ depositType: opts.deposit.type, depositValue: opts.deposit.value })
			.where(eq(events.id, event.id));
		const session = await seedSession(event.id, {}, { priceAmount: opts.unitPrice });
		const coupon = await seedCoupon(event.id, {
			discountType: opts.discountType,
			discountValue: opts.discountValue,
		});
		await seedPromoCode(coupon.id, opts.code);
		return session;
	}

	async function book(sessionId: string, code: string, quantity: number) {
		const { createReservation } = await import('../../src/lib/server/services/reservations');
		const result = await createReservation({
			sessionId,
			email: 'guest@example.com',
			name: 'Promo Guest',
			quantity,
			promoCode: code.toLowerCase(),
		});
		const [reservation] = await testDb.select().from(reservations).where(eq(reservations.id, result.reservation.id));
		const paymentRows = await testDb.select().from(payments).where(eq(payments.reservationId, result.reservation.id));
		return { result, reservation, paymentRows };
	}

	it('a percent Promo Code reduces the total before a percentage Deposit', async () => {
		const session = await seedBookable({
			unitPrice: 4000,
			deposit: { type: 'percent', value: 50 },
			code: 'QUARTER',
			discountType: 'percent',
			discountValue: 25,
		});
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const { reservation, paymentRows } = await book(session.id, 'QUARTER', 3);

		// 3 × 40 € = 120 €, −25 % = 90 €; Deposit 50 % = 45 €; Balance 45 €
		expect(reservation).toMatchObject({ totalAmount: 9000, discountAmount: 3000, depositAmount: 4500, balanceAmount: 4500 });
		expect(paymentRows.map((p) => p.amount)).toEqual([4500]);
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 4500 }));
	});

	it('an amount Promo Code reduces the total before a percentage Deposit — not the Deposit', async () => {
		const session = await seedBookable({
			unitPrice: 5000,
			deposit: { type: 'percent', value: 30 },
			code: 'MINUS30',
			discountType: 'amount',
			discountValue: 3000,
		});
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const { reservation, paymentRows } = await book(session.id, 'MINUS30', 2);

		// 2 × 50 € = 100 €, −30 € = 70 €; Deposit 30 % = 21 €; Balance 49 €
		expect(reservation).toMatchObject({ totalAmount: 7000, discountAmount: 3000, depositAmount: 2100, balanceAmount: 4900 });
		expect(paymentRows.map((p) => p.amount)).toEqual([2100]);
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 2100 }));
	});

	it('a fixed Deposit stays fixed while below the discounted total; the Balance takes the discount', async () => {
		const session = await seedBookable({
			unitPrice: 5000,
			deposit: { type: 'fixed', value: 1500 },
			code: 'MINUS20',
			discountType: 'amount',
			discountValue: 2000,
		});

		const { reservation, paymentRows } = await book(session.id, 'MINUS20', 2);

		// 2 × 50 € = 100 €, −20 € = 80 €; Deposit 2 × 15 € = 30 €; Balance 50 €
		expect(reservation).toMatchObject({ totalAmount: 8000, discountAmount: 2000, depositAmount: 3000, balanceAmount: 5000 });
		expect(paymentRows.map((p) => p.amount)).toEqual([3000]);
	});

	it('a fixed Deposit is capped at a discounted total that falls below it', async () => {
		const session = await seedBookable({
			unitPrice: 3000,
			deposit: { type: 'fixed', value: 2000 },
			code: 'HALF',
			discountType: 'percent',
			discountValue: 50,
		});
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const { reservation, paymentRows } = await book(session.id, 'HALF', 2);

		// 2 × 30 € = 60 €, −50 % = 30 €; fixed 2 × 20 € = 40 € capped at 30 €; Balance 0
		expect(reservation).toMatchObject({ totalAmount: 3000, discountAmount: 3000, depositAmount: 3000, balanceAmount: 0 });
		expect(paymentRows.map((p) => p.amount)).toEqual([3000]);
		expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 3000 }));
	});

	it('a 100 % Promo Code on a fixed-Deposit Event — nothing to pay: confirmed without Stripe', async () => {
		const session = await seedBookable({
			unitPrice: 5000,
			deposit: { type: 'fixed', value: 2000 },
			code: 'ONTHEHOUSE',
			discountType: 'percent',
			discountValue: 100,
		});
		const { createCheckoutSession } = await import('../../src/lib/server/services/stripe');

		const { result, reservation, paymentRows } = await book(session.id, 'ONTHEHOUSE', 2);

		expect(result.checkoutUrl).toBeNull();
		expect(createCheckoutSession).not.toHaveBeenCalled();
		expect(paymentRows).toHaveLength(0);
		expect(reservation).toMatchObject({
			status: 'confirmed',
			totalAmount: 0,
			discountAmount: 10000,
			depositAmount: 0,
			balanceAmount: 0,
		});
	});
});

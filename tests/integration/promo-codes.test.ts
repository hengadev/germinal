// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, coupons, promotionCodes } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/services/stripe', () => ({
	createStripeCoupon: vi.fn(),
	createStripePromotionCode: vi.fn(),
	deactivateStripePromotionCode: vi.fn(),
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

async function seedSession(eventId: string, overrides?: Partial<typeof eventSessions.$inferInsert>) {
	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
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

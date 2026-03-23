import { db } from '../db';
import { logger } from '$lib/server/logger';
import { coupons, promotionCodes, eventSessions } from '../db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { isStripeEnabled } from '../env';

export type PromoCodeForAdmin = {
	id: string;
	code: string;
	active: boolean;
	maxRedemptions: number | null;
	redemptionCount: number;
	expiresAt: string | null;
	stripePromotionCodeId: string | null;
	coupon: {
		id: string;
		name: string;
		discountType: 'percent' | 'amount';
		discountValue: number;
		currency: string | null;
		maxRedemptions: number | null;
		redemptionCount: number;
		expiresAt: string | null;
		stripeCouponId: string | null;
	};
};

export type ValidatePromoCodeResult =
	| {
			valid: true;
			promotionCodeId: string;
			discountType: 'percent' | 'amount';
			discountValue: number;
			currency: string | null;
	  }
	| { valid: false; error: string };

/**
 * Calculate discount amount in cents for a given total
 */
export function calculateDiscountAmount(
	discountType: 'percent' | 'amount',
	discountValue: number,
	totalAmount: number
): number {
	if (discountType === 'percent') {
		return Math.round((totalAmount * discountValue) / 100);
	}
	// Fixed amount: cannot exceed total
	return Math.min(discountValue, totalAmount);
}

/**
 * Create a coupon + promotion code for an event (and mirror to Stripe if enabled)
 */
export async function createPromoCode(input: {
	eventId: string;
	name: string;
	code: string;
	discountType: 'percent' | 'amount';
	discountValue: number;
	currency?: string;
	maxRedemptions?: number;
	expiresAt?: Date;
}) {
	const normalizedCode = input.code.toUpperCase().trim();

	// Check code uniqueness
	const existing = await db.query.promotionCodes.findFirst({
		where: eq(promotionCodes.code, normalizedCode),
	});
	if (existing) {
		throw new Error(`Promotion code "${normalizedCode}" already exists`);
	}

	let stripeCouponId: string | null = null;
	let stripePromoCodeId: string | null = null;

	// Sync to Stripe if enabled
	if (isStripeEnabled()) {
		try {
			const { createStripeCoupon, createStripePromotionCode } = await import('./stripe');
			const stripeCoupon = await createStripeCoupon({
				name: input.name,
				discountType: input.discountType,
				discountValue: input.discountValue,
				currency: input.currency,
				maxRedemptions: input.maxRedemptions,
				expiresAt: input.expiresAt,
			});
			stripeCouponId = stripeCoupon.id;

			const stripePromoCode = await createStripePromotionCode({
				stripeCouponId: stripeCoupon.id,
				code: normalizedCode,
				maxRedemptions: input.maxRedemptions,
				expiresAt: input.expiresAt,
			});
			stripePromoCodeId = stripePromoCode.id;
		} catch (err) {
			logger.error({ err }, '[PromoCodes] Failed to create Stripe coupon/promo code — continuing with local-only');
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return await db.transaction(async (tx: any) => {
		const [coupon] = await tx.insert(coupons).values({
			eventId: input.eventId,
			name: input.name,
			discountType: input.discountType,
			discountValue: input.discountValue,
			currency: input.currency ?? null,
			maxRedemptions: input.maxRedemptions ?? null,
			expiresAt: input.expiresAt ?? null,
			active: true,
			stripeCouponId,
		}).returning();

		const [promoCode] = await tx.insert(promotionCodes).values({
			couponId: coupon.id,
			code: normalizedCode,
			maxRedemptions: input.maxRedemptions ?? null,
			expiresAt: input.expiresAt ?? null,
			active: true,
			stripePromotionCodeId: stripePromoCodeId,
		}).returning();

		return { coupon, promoCode };
	});
}

/**
 * Validate a promotion code for a given event session.
 * Returns discount info if valid, or an error message.
 */
export async function validatePromoCode(
	code: string,
	sessionId: string
): Promise<ValidatePromoCodeResult> {
	const normalizedCode = code.toUpperCase().trim();

	// Look up the session to get the event
	const session = await db.query.eventSessions.findFirst({
		where: eq(eventSessions.id, sessionId),
		columns: { eventId: true },
	});

	if (!session) {
		return { valid: false, error: 'Session not found' };
	}

	// Look up promo code with its coupon
	const promoCode = await db.query.promotionCodes.findFirst({
		where: eq(promotionCodes.code, normalizedCode),
		with: { coupon: true },
	});

	if (!promoCode) {
		return { valid: false, error: 'Invalid promotion code' };
	}

	// Check promo code belongs to this event (via coupon)
	if (promoCode.coupon.eventId !== session.eventId) {
		return { valid: false, error: 'Promotion code is not valid for this event' };
	}

	// Check active status
	if (!promoCode.active || !promoCode.coupon.active) {
		return { valid: false, error: 'Promotion code is no longer active' };
	}

	const now = new Date();

	// Check expiry
	if (promoCode.expiresAt && promoCode.expiresAt < now) {
		return { valid: false, error: 'Promotion code has expired' };
	}
	if (promoCode.coupon.expiresAt && promoCode.coupon.expiresAt < now) {
		return { valid: false, error: 'Promotion code has expired' };
	}

	// Check redemption limits
	if (
		promoCode.maxRedemptions !== null &&
		promoCode.redemptionCount >= promoCode.maxRedemptions
	) {
		return { valid: false, error: 'Promotion code has reached its usage limit' };
	}
	if (
		promoCode.coupon.maxRedemptions !== null &&
		promoCode.coupon.redemptionCount >= promoCode.coupon.maxRedemptions
	) {
		return { valid: false, error: 'Promotion code has reached its usage limit' };
	}

	return {
		valid: true,
		promotionCodeId: promoCode.id,
		discountType: promoCode.coupon.discountType,
		discountValue: promoCode.coupon.discountValue,
		currency: promoCode.coupon.currency,
	};
}

/**
 * Atomically increment redemption count for a promotion code and its coupon.
 * Must be called inside an existing transaction.
 * Throws if the code has been exhausted since last validation (race condition guard).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function incrementRedemption(promotionCodeId: string, tx: any): Promise<void> {
	const now = new Date();

	// Atomic check + increment on promo code
	const [updatedCode] = await tx
		.update(promotionCodes)
		.set({
			redemptionCount: sql`${promotionCodes.redemptionCount} + 1`,
			updatedAt: now,
		})
		.where(
			and(
				eq(promotionCodes.id, promotionCodeId),
				eq(promotionCodes.active, true),
				sql`(${promotionCodes.maxRedemptions} IS NULL OR ${promotionCodes.redemptionCount} < ${promotionCodes.maxRedemptions})`
			)
		)
		.returning({ couponId: promotionCodes.couponId });

	if (!updatedCode) {
		throw new Error('Promotion code is no longer available');
	}

	// Atomic check + increment on coupon
	const [updatedCoupon] = await tx
		.update(coupons)
		.set({
			redemptionCount: sql`${coupons.redemptionCount} + 1`,
			updatedAt: now,
		})
		.where(
			and(
				eq(coupons.id, updatedCode.couponId),
				eq(coupons.active, true),
				sql`(${coupons.maxRedemptions} IS NULL OR ${coupons.redemptionCount} < ${coupons.maxRedemptions})`
			)
		)
		.returning({ id: coupons.id });

	if (!updatedCoupon) {
		throw new Error('Promotion code is no longer available');
	}
}

/**
 * Decrement redemption count (on reservation expiry or cancellation).
 */
export async function decrementRedemption(promotionCodeId: string): Promise<void> {
	const promoCode = await db.query.promotionCodes.findFirst({
		where: eq(promotionCodes.id, promotionCodeId),
		columns: { couponId: true },
	});
	if (!promoCode) return;

	const now = new Date();
	await db.update(promotionCodes)
		.set({
			redemptionCount: sql`GREATEST(0, ${promotionCodes.redemptionCount} - 1)`,
			updatedAt: now,
		})
		.where(eq(promotionCodes.id, promotionCodeId));

	await db.update(coupons)
		.set({
			redemptionCount: sql`GREATEST(0, ${coupons.redemptionCount} - 1)`,
			updatedAt: now,
		})
		.where(eq(coupons.id, promoCode.couponId));
}

/**
 * Deactivate a promotion code (and notify Stripe if enabled).
 */
export async function deactivatePromoCode(promotionCodeId: string): Promise<void> {
	const promoCode = await db.query.promotionCodes.findFirst({
		where: eq(promotionCodes.id, promotionCodeId),
		columns: { stripePromotionCodeId: true, couponId: true },
	});
	if (!promoCode) throw new Error('Promotion code not found');

	await db.update(promotionCodes)
		.set({ active: false, updatedAt: new Date() })
		.where(eq(promotionCodes.id, promotionCodeId));

	// Deactivate in Stripe if synced
	if (promoCode.stripePromotionCodeId && isStripeEnabled()) {
		try {
			const { deactivateStripePromotionCode } = await import('./stripe');
			await deactivateStripePromotionCode(promoCode.stripePromotionCodeId);
		} catch (err) {
			logger.error({ err }, '[PromoCodes] Failed to deactivate Stripe promotion code');
		}
	}
}

/**
 * Get all promotion codes for an event (with coupon details), for admin display.
 */
export async function getPromoCodesForEvent(eventId: string): Promise<PromoCodeForAdmin[]> {
	const results = await db.query.coupons.findMany({
		where: eq(coupons.eventId, eventId),
		with: {
			promotionCodes: true,
		},
		orderBy: [desc(coupons.createdAt)],
	});

	return results.flatMap((coupon: typeof results[number]) =>
		coupon.promotionCodes.map((pc: typeof coupon.promotionCodes[number]) => ({
			id: pc.id,
			code: pc.code,
			active: pc.active,
			maxRedemptions: pc.maxRedemptions,
			redemptionCount: pc.redemptionCount,
			expiresAt: pc.expiresAt?.toISOString() ?? null,
			stripePromotionCodeId: pc.stripePromotionCodeId,
			coupon: {
				id: coupon.id,
				name: coupon.name,
				discountType: coupon.discountType,
				discountValue: coupon.discountValue,
				currency: coupon.currency,
				maxRedemptions: coupon.maxRedemptions,
				redemptionCount: coupon.redemptionCount,
				expiresAt: coupon.expiresAt?.toISOString() ?? null,
				stripeCouponId: coupon.stripeCouponId,
			},
		}))
	);
}

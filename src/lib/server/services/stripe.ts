import Stripe from 'stripe';
import { env, isStripeEnabled } from '../env';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
	if (!isStripeEnabled()) {
		throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables.');
	}

	if (!stripeClient) {
		stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
			apiVersion: '2025-12-15.clover',
			typescript: true,
		});
	}

	return stripeClient;
}

export type CreateCheckoutSessionParams = {
	reservationId: string;
	accessToken: string;
	amount: number;
	currency: string;
	quantity: number;
	productName: string;
	customerEmail: string;
	metadata: {
		reservationId: string;
		sessionId: string;
		guestEmail: string;
	};
	successUrl: string;
	cancelUrl: string;
	expiresAt: Date;
};

/**
 * Create a Stripe Checkout Session for a reservation (hosted Stripe payment page)
 */
export async function createCheckoutSession(params: CreateCheckoutSessionParams) {
	const stripe = getStripeClient();

	// Stripe minimum expiry is 30 minutes; use whichever is later
	const expiresAt = Math.max(
		Math.floor(params.expiresAt.getTime() / 1000),
		Math.floor(Date.now() / 1000) + 30 * 60
	);

	const session = await stripe.checkout.sessions.create({
		mode: 'payment',
		customer_email: params.customerEmail,
		line_items: [{
			price_data: {
				currency: params.currency.toLowerCase(),
				unit_amount: params.amount,
				product_data: {
					name: params.productName,
				},
			},
			quantity: 1,
		}],
		payment_intent_data: {
			metadata: params.metadata,
		},
		metadata: params.metadata,
		success_url: params.successUrl,
		cancel_url: params.cancelUrl,
		expires_at: expiresAt,
	}, {
		idempotencyKey: `checkout-${params.reservationId}`,
	});

	return session;
}

/**
 * Cancel a Stripe Checkout Session (for failed reservations)
 */
export async function cancelCheckoutSession(sessionId: string): Promise<void> {
	const stripe = getStripeClient();
	try {
		await stripe.checkout.sessions.expire(sessionId);
	} catch (error) {
		if (error instanceof Stripe.errors.StripeError) {
			if (error.code === 'resource_missing') return; // Already expired/completed
		}
		throw error;
	}
}

/**
 * Cancel a PaymentIntent (for expired reservations)
 */
export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
	const stripe = getStripeClient();

	try {
		await stripe.paymentIntents.cancel(paymentIntentId);
	} catch (error) {
		// If already succeeded or canceled, ignore the error
		if (error instanceof Stripe.errors.StripeError) {
			if (error.code === 'payment_intent_unexpected_state') {
				return; // Already in a terminal state
			}
		}
		throw error;
	}
}

/**
 * Create a refund for a PaymentIntent
 */
export async function createRefund(paymentIntentId: string, amount?: number) {
	const stripe = getStripeClient();

	const refund = await stripe.refunds.create({
		payment_intent: paymentIntentId,
		amount, // Optional: partial refund
	});

	return refund;
}

/**
 * Create a Stripe Coupon object
 */
export async function createStripeCoupon(params: {
	name: string;
	discountType: 'percent' | 'amount';
	discountValue: number;
	currency?: string;
	maxRedemptions?: number;
	expiresAt?: Date;
}) {
	const stripe = getStripeClient();

	return await stripe.coupons.create({
		name: params.name,
		...(params.discountType === 'percent'
			? { percent_off: params.discountValue }
			: { amount_off: params.discountValue, currency: params.currency ?? 'eur' }),
		max_redemptions: params.maxRedemptions ?? undefined,
		redeem_by: params.expiresAt ? Math.floor(params.expiresAt.getTime() / 1000) : undefined,
	});
}

/**
 * Create a Stripe PromotionCode attached to a coupon
 */
export async function createStripePromotionCode(params: {
	stripeCouponId: string;
	code: string;
	maxRedemptions?: number;
	expiresAt?: Date;
}) {
	const stripe = getStripeClient();

	return await stripe.promotionCodes.create({
		promotion: { type: 'coupon', coupon: params.stripeCouponId },
		code: params.code,
		max_redemptions: params.maxRedemptions ?? undefined,
		expires_at: params.expiresAt ? Math.floor(params.expiresAt.getTime() / 1000) : undefined,
	});
}

/**
 * Deactivate a Stripe PromotionCode
 */
export async function deactivateStripePromotionCode(stripePromotionCodeId: string): Promise<void> {
	const stripe = getStripeClient();
	await stripe.promotionCodes.update(stripePromotionCodeId, { active: false });
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
	payload: string,
	signature: string,
	secret: string
): Stripe.Event {
	const stripe = getStripeClient();

	try {
		return stripe.webhooks.constructEvent(payload, signature, secret);
	} catch (error) {
		throw new Error(`Webhook signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

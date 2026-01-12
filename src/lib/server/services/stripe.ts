import Stripe from 'stripe';
import { env, isStripeEnabled } from '../env';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
	if (!isStripeEnabled()) {
		throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables.');
	}

	if (!stripeClient) {
		stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
			apiVersion: '2024-12-18.acacia',
			typescript: true,
		});
	}

	return stripeClient;
}

export type CreatePaymentIntentParams = {
	reservationId: string;
	amount: number;
	currency: string;
	metadata: {
		reservationId: string;
		sessionId: string;
		guestEmail: string;
	};
};

/**
 * Create a Stripe PaymentIntent for a reservation
 */
export async function createPaymentIntent(params: CreatePaymentIntentParams) {
	const stripe = getStripeClient();

	const idempotencyKey = `reservation-${params.reservationId}`;

	const paymentIntent = await stripe.paymentIntents.create({
		amount: params.amount,
		currency: params.currency,
		metadata: params.metadata,
		automatic_payment_methods: {
			enabled: true,
		},
	}, {
		idempotencyKey,
	});

	return paymentIntent;
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

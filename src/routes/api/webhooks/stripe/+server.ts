import { json, error } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { verifyWebhookSignature } from '$lib/server/services/stripe';
import { handlePaymentSuccess, handlePaymentFailure, handleRefund } from '$lib/server/services/payments';
import { logger } from '$lib/server/logger';
import type { RequestHandler } from './$types';
import type Stripe from 'stripe';

export const POST: RequestHandler = async ({ request }) => {
	// Get raw body (needed for signature verification)
	const payload = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		throw error(400, 'Missing stripe-signature header');
	}

	let event: Stripe.Event;

	try {
		// Verify webhook signature
		event = verifyWebhookSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
	} catch (err) {
		logger.error({ error: err }, 'Webhook signature verification failed');
		throw error(400, 'Invalid webhook signature');
	}

	logger.info({ eventType: event.type }, 'Received Stripe webhook');

	try {
		// Handle different event types
		switch (event.type) {
			case 'payment_intent.succeeded':
				await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
				break;

			case 'payment_intent.payment_failed':
				await handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
				break;

			case 'charge.refunded':
				await handleRefund(event.data.object as Stripe.Charge);
				break;

			default:
				logger.info({ eventType: event.type }, 'Unhandled event type');
		}

		return json({ received: true });
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		logger.error({ error: err, eventType: event.type }, 'Webhook handler error');

		// Determine if this is a transient or permanent error
		const isTransientError = err instanceof Error && (
			errorMsg.includes('connection') ||
			errorMsg.includes('timeout') ||
			errorMsg.includes('network') ||
			errorMsg.includes('ECONNREFUSED') ||
			errorMsg.includes('ETIMEDOUT')
		);

		if (isTransientError) {
			// Transient errors should trigger retry (500 status)
			throw error(500, 'Webhook processing temporarily failed');
		} else {
			// Permanent errors should not trigger retry (200 status)
			// Stripe will not retry, preventing infinite loop
			return json({ received: true, error: 'Webhook processing failed' });
		}
	}
};

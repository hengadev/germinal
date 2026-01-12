import { json, error } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { verifyWebhookSignature } from '$lib/server/services/stripe';
import { handlePaymentSuccess, handlePaymentFailure, handleRefund } from '$lib/server/services/payments';
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
		console.error('Webhook signature verification failed:', err);
		throw error(400, `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}

	console.log(`Received Stripe webhook: ${event.type}`);

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
				console.log(`Unhandled event type: ${event.type}`);
		}

		return json({ received: true });
	} catch (err) {
		console.error('Webhook handler error:', err);
		// Return 200 to acknowledge receipt even if processing fails
		// Stripe will retry failed webhooks
		return json({ received: true, error: err instanceof Error ? err.message : 'Unknown error' });
	}
};

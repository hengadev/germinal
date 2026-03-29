import { env } from '$lib/server/env';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return empty array
		return {
			payments: []
		};
	}

	// Database mode - use actual database
	const { db } = await import('$lib/server/db');
	const { payments } = await import('$lib/server/db/schema');
	const { desc, isNull } = await import('drizzle-orm');

	// Find payments where webhookProcessedAt is NULL (webhook not processed)
	const unprocessedPayments = await db.query.payments.findMany({
		where: isNull(payments.webhookProcessedAt),
		orderBy: [desc(payments.createdAt)],
		with: {
			reservation: {
				columns: {
					id: true,
					guestName: true,
					guestEmail: true,
					quantity: true,
					totalAmount: true,
					currency: true,
					status: true
				},
				with: {
					eventSession: {
						columns: {
							title: true,
							startTime: true
						},
						with: {
							event: {
								columns: {
									title: true
								}
							}
						}
					}
				}
			}
		}
	});

	return {
		payments: unprocessedPayments.map((p: typeof unprocessedPayments[number]) => ({
			id: p.id,
			stripePaymentIntentId: p.stripePaymentIntentId,
			status: p.status,
			amount: p.amount,
			currency: p.currency,
			lastError: p.lastError,
			createdAt: p.createdAt.toISOString(),
			updatedAt: p.updatedAt.toISOString(),
			reservation: p.reservation ? {
				id: p.reservation.id,
				guestName: p.reservation.guestName,
				guestEmail: p.reservation.guestEmail,
				quantity: p.reservation.quantity,
				totalAmount: p.reservation.totalAmount,
				currency: p.reservation.currency,
				status: p.reservation.status,
				sessionTitle: p.reservation.eventSession?.titleEn,
				eventTitle: p.reservation.eventSession?.event?.titleEn,
				sessionStartTime: p.reservation.eventSession?.startTime.toISOString()
			} : null
		}))
	};
};

export const actions: Actions = {
	retry: async ({ request }) => {
		if (env.USE_MOCK_DATA) {
			return { success: true, message: 'Webhook retried (mock)' };
		}

		const formData = await request.formData();
		const paymentId = formData.get('paymentId') as string;

		if (!paymentId) {
			return fail(400, { error: 'Payment ID is required' });
		}

		try {
			// Get payment details
			const { db } = await import('$lib/server/db');
			const { payments } = await import('$lib/server/db/schema');
			const { eq } = await import('drizzle-orm');

			const payment = await db.query.payments.findFirst({
				where: eq(payments.id, paymentId)
			});

			if (!payment) {
				return fail(404, { error: 'Payment not found' });
			}

			// Trigger manual webhook processing via Stripe
			const { getStripeClient } = await import('$lib/server/services/stripe');
			const stripe = getStripeClient();

			// Get the Stripe Payment Intent to trigger webhook
			const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

			// The actual webhook processing would be done by the webhook endpoint
			// For now, we just mark it as processed if payment was successful
			if (paymentIntent.status === 'succeeded') {
				await db.update(payments)
					.set({
						status: 'succeeded',
						webhookProcessedAt: new Date()
					})
					.where(eq(payments.id, paymentId));

				// Confirm reservation if needed
				if (payment.reservationId) {
					const { reservations } = await import('$lib/server/db/schema');
					await db.update(reservations)
						.set({
							status: 'confirmed',
							confirmedAt: new Date()
						})
						.where(eq(reservations.id, payment.reservationId));
				}

				return { success: true, message: 'Webhook processed successfully' };
			}

			return fail(400, { error: `Payment status is ${paymentIntent.status}, cannot process` });
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to process webhook' });
		}
	}
};

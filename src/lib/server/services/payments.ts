import { db } from '../db';
import { logger } from '$lib/server/logger';
import { payments, reservations, eventSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { sendTicketConfirmationEmail } from './email';

/**
 * Handle successful payment from Stripe webhook
 */
export async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
	const payment = await db.query.payments.findFirst({
		where: eq(payments.stripePaymentIntentId, paymentIntent.id),
		with: {
			reservation: {
				with: {
					eventSession: {
						with: {
							event: true,
						},
					},
				},
			},
		},
	});

	if (!payment) {
		console.warn(`Payment not found for PaymentIntent: ${paymentIntent.id}`);
		return;
	}

	// Idempotency check
	if (payment.webhookProcessedAt) {
		logger.info(`Webhook already processed for payment: ${payment.id}`);
		return;
	}

	// Update payment status
	// Note: In newer Stripe API, charges is not available on PaymentIntent directly
	// Receipt URL would need to be fetched separately via stripe.charges.retrieve if needed
	await db.update(payments)
		.set({
			status: 'succeeded',
			stripeChargeId: typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id ?? null,
			receiptUrl: null, // Would need separate API call to get receipt URL
			webhookProcessedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(payments.id, payment.id));

	// Confirm reservation
	await db.update(reservations)
		.set({
			status: 'confirmed',
			confirmedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(reservations.id, payment.reservationId));

	// Send ticket confirmation email
	try {
		await sendTicketConfirmationEmail({
			guestEmail: payment.reservation.guestEmail,
			guestName: payment.reservation.guestName,
			accessToken: payment.reservation.accessToken,
			reservation: payment.reservation,
			session: payment.reservation.eventSession,
			event: payment.reservation.eventSession.event,
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to send ticket confirmation email');
		// Don't throw - payment is still successful
	}

	// Send SMS confirmation if user opted in and has phone number
	if (payment.reservation.guestPhone && payment.reservation.notificationPreference !== 'email') {
		try {
			const { sendTicketConfirmationSMS } = await import('./sms');
			await sendTicketConfirmationSMS({
				phone: payment.reservation.guestPhone,
				guestName: payment.reservation.guestName,
				eventTitle: payment.reservation.eventSession.event.title,
				sessionStartTime: payment.reservation.eventSession.startTime,
				accessToken: payment.reservation.accessToken,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send ticket confirmation SMS');
			// Don't throw - email was already sent
		}
	}
}

/**
 * Handle failed payment from Stripe webhook
 * Immediately expires the reservation and restores capacity
 */
export async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
	const payment = await db.query.payments.findFirst({
		where: eq(payments.stripePaymentIntentId, paymentIntent.id),
		with: {
			reservation: true,
		},
	});

	if (!payment) {
		return;
	}

	// Use a transaction to atomically update payment, expire reservation, and restore capacity
	await db.transaction(async (tx: typeof db) => {
		// Update payment status
		await tx.update(payments)
			.set({
				status: 'failed',
				lastError: paymentIntent.last_payment_error?.message ?? null,
				webhookProcessedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(payments.id, payment.id));

		// Expire reservation immediately
		await tx.update(reservations)
			.set({
				status: 'expired',
				updatedAt: new Date(),
			})
			.where(eq(reservations.id, payment.reservationId));

		// Lock session and restore capacity
		const [session] = await tx
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, payment.reservation.eventSessionId))
			.for('update');

		if (session) {
			await tx.update(eventSessions)
				.set({
					availableCapacity: session.availableCapacity + payment.reservation.quantity,
					updatedAt: new Date(),
				})
				.where(eq(eventSessions.id, payment.reservation.eventSessionId));

			logger.info(`[Payment Failure] Restored ${payment.reservation.quantity} tickets for reservation ${payment.reservationId}`);
		}
	});
}

/**
 * Handle refund from Stripe webhook
 */
export async function handleRefund(charge: Stripe.Charge) {
	if (!charge.payment_intent) {
		return;
	}

	const payment = await db.query.payments.findFirst({
		where: eq(payments.stripePaymentIntentId, charge.payment_intent as string),
	});

	if (!payment) {
		return;
	}

	const refundedAmount = charge.amount_refunded;
	const isFullyRefunded = refundedAmount === charge.amount;

	await db.update(payments)
		.set({
			status: isFullyRefunded ? 'refunded' : 'partially_refunded',
			refundedAmount,
			updatedAt: new Date(),
		})
		.where(eq(payments.id, payment.id));
}

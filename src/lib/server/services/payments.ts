import { db } from '../db';
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
		console.log(`Webhook already processed for payment: ${payment.id}`);
		return;
	}

	// Update payment status
	await db.update(payments)
		.set({
			status: 'succeeded',
			stripeChargeId: paymentIntent.latest_charge as string ?? null,
			receiptUrl: paymentIntent.charges?.data[0]?.receipt_url ?? null,
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
		console.error('Failed to send ticket confirmation email:', error);
		// Don't throw - payment is still successful
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
	await db.transaction(async (tx) => {
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

			console.log(`[Payment Failure] Restored ${payment.reservation.quantity} tickets for reservation ${payment.reservationId}`);
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

import { db } from '../db';
import { logger } from '$lib/server/logger';
import { payments, reservations, eventSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { sendTicketNotifications } from './ticket-notifications';
import { seatingTitle } from '$lib/utils/seating-title';

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

	await db.transaction(async (tx) => {
		await tx.update(payments)
			.set({
				status: 'succeeded',
				stripeChargeId: typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id ?? null,
				receiptUrl: null,
				webhookProcessedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(payments.id, payment.id));

		await tx.update(reservations)
			.set({
				status: 'confirmed',
				confirmedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(reservations.id, payment.reservationId));
	});

	// Send the Ticket (email, and SMS if opted in); failures are logged, never thrown.
	await sendTicketNotifications(payment.reservation);
}

/**
 * Handle checkout.session.completed from Stripe webhook.
 * Looks up payment by checkout session ID (stored as placeholder), updates it to the
 * real PaymentIntent ID, confirms the reservation, and sends notifications.
 */
export async function handleCheckoutSuccess(session: Stripe.Checkout.Session) {
	// Find payment by checkout session ID (stored in stripePaymentIntentId as placeholder)
	const payment = await db.query.payments.findFirst({
		where: eq(payments.stripePaymentIntentId, session.id),
		with: {
			reservation: {
				with: {
					eventSession: {
						with: { event: true },
					},
				},
			},
		},
	});

	if (!payment) {
		console.warn(`Payment not found for Checkout Session: ${session.id}`);
		return;
	}

	// Idempotency check
	if (payment.webhookProcessedAt) {
		logger.info(`Webhook already processed for payment: ${payment.id}`);
		return;
	}

	const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;

	// Update payment: swap placeholder to real PI ID and mark as succeeded
	await db.update(payments)
		.set({
			...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
			stripeChargeId: typeof session.payment_intent === 'string' ? null : null,
			status: 'succeeded',
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

	// Send the Ticket (email, and SMS if opted in); failures are logged, never thrown.
	await sendTicketNotifications(payment.reservation);
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

	if (payment.webhookProcessedAt) {
		logger.info(`Webhook already processed for payment: ${payment.id}`);
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
 * Handle refund from Stripe webhook.
 *
 * Covers refunds that don't go through the app's own admin refund action —
 * e.g. a dispute/chargeback, or a refund issued directly in the Stripe
 * dashboard — so this is the one refund path where we're finding out about
 * the refund after the fact, and where it may be partial or full.
 */
export async function handleRefund(charge: Stripe.Charge) {
	if (!charge.payment_intent) {
		return;
	}

	const payment = await db.query.payments.findFirst({
		where: eq(payments.stripePaymentIntentId, charge.payment_intent as string),
		with: {
			reservation: {
				with: {
					eventSession: {
						with: { event: true },
					},
				},
			},
		},
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

	// Notify the guest — best-effort, never blocks the webhook response
	const reservation = payment.reservation;
	if (reservation) {
		try {
			const { sendRefundEmail } = await import('./email');
			await sendRefundEmail({
				guestEmail: reservation.guestEmail,
				guestName: reservation.guestName,
				eventTitle: reservation.eventSession.event.titleEn,
				sessionTitle: seatingTitle(reservation.eventSession, 'en', { timeZone: reservation.eventSession.event.timeZone }),
				sessionStartTime: reservation.eventSession.startTime,
				timeZone: reservation.eventSession.event.timeZone,
				reservationId: reservation.id,
				amount: refundedAmount,
				currency: payment.currency,
				isPartialRefund: !isFullyRefunded,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send refund email');
			// Don't throw - the payment/refund was already recorded successfully
		}

		if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
			try {
				const { sendRefundSMS } = await import('./sms');
				await sendRefundSMS({
					phone: reservation.guestPhone,
					name: reservation.guestName,
					eventTitle: reservation.eventSession.event.titleEn,
					amount: refundedAmount,
					currency: payment.currency,
				});
			} catch (error) {
				logger.error({ err: error }, 'Failed to send refund SMS');
				// Don't throw - email might have been sent
			}
		}
	}
}

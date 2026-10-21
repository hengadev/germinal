import { db } from '../db';
import { logger } from '$lib/server/logger';
import { payments } from '../db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import type Stripe from 'stripe';
import { sendTicketNotifications } from './ticket-notifications';
import { seatingTitle } from '$lib/utils/seating-title';
import { confirmReservationForPayment, expireReservationForFailedPayment } from './reservation-transitions';

/**
 * Find the payment of a Stripe object by any of the ids it may be stored
 * under: the Checkout Session id (the placeholder written at booking time)
 * or the PaymentIntent id a paid session swaps it for — so a delivery
 * retried after the swap still finds its payment.
 */
async function findPaymentByStripeId(...stripeIds: (string | null)[]) {
	const ids = stripeIds.filter((id): id is string => Boolean(id));
	if (ids.length === 0) return null;
	const payment = await db.query.payments.findFirst({
		where: or(...ids.map((id) => eq(payments.stripePaymentIntentId, id))),
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
	return payment ?? null;
}

type PaymentWithReservation = NonNullable<Awaited<ReturnType<typeof findPaymentByStripeId>>>;

/**
 * Handle successful payment from Stripe webhook
 */
export async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
	const payment = await findPaymentByStripeId(paymentIntent.id);

	if (!payment) {
		console.warn(`Payment not found for PaymentIntent: ${paymentIntent.id}`);
		return;
	}

	// pending → confirmed through the Reservation transitions module: one
	// conditional update, so concurrent or repeated deliveries confirm once,
	// and a Reservation that is no longer pending is left alone.
	const outcome = await confirmReservationForPayment({
		reservationId: payment.reservationId,
		paymentId: payment.id,
		paymentIntentId: paymentIntent.id,
		stripeChargeId: typeof paymentIntent.latest_charge === 'string'
			? paymentIntent.latest_charge
			: paymentIntent.latest_charge?.id ?? null,
	});

	if (!outcome.won) {
		logger.info(
			{ reservationId: payment.reservationId, status: outcome.status },
			'Reservation no longer pending; success not confirmed',
		);
		return;
	}

	// Send the Ticket (email, and SMS if opted in); failures are logged, never thrown.
	await sendTicketNotifications(payment.reservation);
}

/**
 * Handle checkout.session.completed — and the
 * checkout.session.async_payment_succeeded that follows it for a delayed
 * payment method — from the Stripe webhook.
 *
 * Only a session Stripe reports as **paid** confirms its Reservation: a
 * delayed method completing unpaid confirms nothing (its async events
 * decide later). Confirmation is the Reservation transitions module's
 * pending → confirmed conditional update, so concurrent or repeated
 * deliveries confirm once and send one Ticket. A paid session arriving
 * after the Reservation's hold is gone (expired or cancelled) is refunded
 * in full instead — the seats were already released, so the Reservation
 * and the Seating's capacity stay untouched.
 */
export async function handleCheckoutSuccess(session: Stripe.Checkout.Session) {
	const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;

	// The payment is stored under the Checkout Session id as a placeholder
	// until a paid session swaps in the real PaymentIntent id; look it up by
	// either, so a delivery retried after the swap still finds it.
	const payment = await findPaymentByStripeId(session.id, paymentIntentId);
	if (!payment) {
		console.warn(`Payment not found for Checkout Session: ${session.id}`);
		return;
	}

	if (session.payment_status !== 'paid') {
		logger.info(
			{ checkoutSessionId: session.id, paymentStatus: session.payment_status },
			'Checkout Session completed without payment; nothing confirmed',
		);
		return;
	}

	const outcome = await confirmReservationForPayment({
		reservationId: payment.reservationId,
		paymentId: payment.id,
		paymentIntentId,
	});

	if (outcome.won) {
		// Send the Ticket (email, and SMS if opted in) once, after the
		// confirmation is committed; failures are logged, never thrown.
		await sendTicketNotifications(payment.reservation);
		return;
	}

	// Another delivery moved the Reservation first. A duplicate of a
	// confirmation lands here as 'confirmed' and does nothing; a payment
	// that arrived after the hold expired is refunded in full.
	if (outcome.status === 'expired' || outcome.status === 'cancelled') {
		await refundLatePayment(payment, paymentIntentId);
		return;
	}

	logger.info(
		{ reservationId: payment.reservationId, status: outcome.status },
		'Reservation already handled by another delivery; nothing to do',
	);
}

/**
 * A paid Checkout Session arrived for a Reservation whose hold is already
 * gone (expired or cancelled): the seats were released, so the money goes
 * back in full. The Stripe refund carries an idempotency key derived from
 * the payment id, so concurrent or repeated deliveries of the same event
 * ask Stripe for the same refund; the payment is marked refunded by a
 * conditional update, so the Guest is notified once. The Reservation's
 * status and the Seating's capacity are deliberately untouched.
 */
async function refundLatePayment(payment: PaymentWithReservation, paymentIntentId: string | null) {
	if (!paymentIntentId) {
		logger.error(
			{ paymentId: payment.id },
			'Paid Checkout Session for a released Reservation carries no PaymentIntent id; refund it by hand',
		);
		return;
	}
	if (payment.status === 'refunded') {
		return;
	}

	const { createRefund } = await import('./stripe');
	// A Stripe failure propagates, so the webhook answers 5xx and Stripe
	// retries; the idempotency key keeps the retry from double-refunding.
	const refund = await createRefund(paymentIntentId, payment.amount, {
		idempotencyKey: `late-payment-refund-${payment.id}`,
	});

	// Claim the recording (and the notification) for one delivery only.
	const claimed = await db.update(payments)
		.set({
			status: 'refunded',
			refundedAmount: refund.amount,
			// Keep the payment correlatable with the charge.refunded event.
			stripePaymentIntentId: paymentIntentId,
			webhookProcessedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(and(
			eq(payments.id, payment.id),
			isNull(payments.webhookProcessedAt),
		))
		.returning({ id: payments.id });

	if (claimed.length === 0) {
		logger.info({ paymentId: payment.id }, 'Late-payment refund already recorded by another delivery');
		return;
	}

	// Notify the Guest — best-effort, never blocks the webhook response.
	try {
		const { sendRefundEmail } = await import('./email');
		await sendRefundEmail({
			guestEmail: payment.reservation.guestEmail,
			guestName: payment.reservation.guestName,
			eventTitle: payment.reservation.eventSession.event.titleEn,
			sessionTitle: seatingTitle(payment.reservation.eventSession, 'en', {
				timeZone: payment.reservation.eventSession.event.timeZone,
			}),
			sessionStartTime: payment.reservation.eventSession.startTime,
			timeZone: payment.reservation.eventSession.event.timeZone,
			reservationId: payment.reservation.id,
			amount: refund.amount,
			currency: payment.currency,
			isPartialRefund: false,
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to send late-payment refund email');
	}

	if (payment.reservation.guestPhone && payment.reservation.notificationPreference !== 'email') {
		try {
			const { sendRefundSMS } = await import('./sms');
			await sendRefundSMS({
				phone: payment.reservation.guestPhone,
				name: payment.reservation.guestName,
				eventTitle: payment.reservation.eventSession.event.titleEn,
				amount: refund.amount,
				currency: payment.currency,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send late-payment refund SMS');
		}
	}
}

/**
 * Fail a payment and expire its Reservation, restoring the Seating's
 * capacity — what every payment failure does (a card declined at checkout,
 * or the async failure of a delayed payment method). Shared by
 * {@link handlePaymentFailure} and {@link handleAsyncPaymentFailed}.
 */
async function failPaymentAndExpireReservation(
	payment: PaymentWithReservation,
	lastError: string | null
) {
	// pending → expired through the Reservation transitions module: a
	// failure delivered twice, or racing the expiry job, restores capacity once.
	const { won } = await expireReservationForFailedPayment({
		reservationId: payment.reservationId,
		paymentId: payment.id,
		lastError,
	});
	if (won) {
		logger.info(`[Payment Failure] Restored ${payment.reservation.quantity} tickets for reservation ${payment.reservationId}`);
	}
}

/**
 * Handle failed payment from Stripe webhook
 * Immediately expires the reservation and restores capacity
 */
export async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
	const payment = await findPaymentByStripeId(paymentIntent.id);

	if (!payment) {
		return;
	}

	if (payment.webhookProcessedAt) {
		logger.info(`Webhook already processed for payment: ${payment.id}`);
		return;
	}

	await failPaymentAndExpireReservation(payment, paymentIntent.last_payment_error?.message ?? null);
}

/**
 * Handle checkout.session.async_payment_failed: a delayed payment method
 * (one whose checkout.session.completed arrived unpaid) failed after the
 * session completed. Handled like any payment failure — the Reservation
 * expires and the Seating's capacity is restored.
 */
export async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
	const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
	const payment = await findPaymentByStripeId(session.id, paymentIntentId);

	if (!payment) {
		return;
	}

	if (payment.webhookProcessedAt) {
		logger.info(`Webhook already processed for payment: ${payment.id}`);
		return;
	}

	await failPaymentAndExpireReservation(payment, 'Asynchronous payment failed');
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

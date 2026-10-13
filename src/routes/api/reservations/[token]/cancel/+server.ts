import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReservationByToken } from '$lib/server/services/reservations';
import { db } from '$lib/server/db';
import { reservations, payments, eventSessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { seatingTitle } from '$lib/utils/seating-title';
import { cancelByGuestWithPolicy, getGuestCancellationTerms } from '$lib/server/services/cancellation';

/**
 * Self-service cancellation from the Ticket (issue 028): the Event's Refund
 * Policy decides.
 * - Manual policy (every migrated Event — its statement promises exactly
 *   this): cancellable up to 24 hours before the Seating, with a full
 *   refund of what was paid online — the historical behaviour, unchanged.
 * - Rule-based policy: cancellable until the Seating starts; the refund is
 *   the policy's amount (possibly nothing — the seats are freed anyway).
 * See guestCancellationTerms.
 */
// POST /api/reservations/[token]/cancel - Cancel a reservation
export const POST: RequestHandler = async ({ params }) => {
	const { token } = params;

	try {
		// Get reservation by token
		const reservation = await getReservationByToken(token);

		if (!reservation) {
			return json({ error: 'Reservation not found' }, { status: 404 });
		}

		// Check if can cancel, and how the refund is decided
		const terms = await getGuestCancellationTerms(reservation.id);

		if (!terms.canCancel) {
			return json({ error: terms.reason || 'Cannot cancel reservation' }, { status: 400 });
		}

		if (terms.mode === 'policy') {
			// Rule-based Refund Policy: refund the policy's amount through the
			// shared refund path (which also notifies the guest).
			const result = await cancelByGuestWithPolicy(reservation.id);
			logger.info(`Reservation ${reservation.id} cancelled by user (policy refund ${result.refundAmount})`);
			return json({
				success: true,
				refund: result.refundAmount > 0 ? { amount: result.refundAmount, currency: result.currency } : null,
			});
		}

		// Manual Refund Policy: the historical full refund below.

		// Use transaction to update reservation and process refund. Returns
		// refund info (or null) so we know afterward whether to send the guest
		// a plain cancellation notification or a refund notification.
		const refundResult: { amount: number; currency: string } | null = await db.transaction(async (tx) => {
			let refund: { amount: number; currency: string } | null = null;
			// Update reservation status
			await tx
				.update(reservations)
				.set({
					status: 'cancelled',
					cancelledAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(reservations.id, reservation.id));

			// Restore capacity
			const [session] = await tx
				.select()
				.from(eventSessions)
				.where(eq(eventSessions.id, reservation.eventSessionId))
				.for('update');

			if (session) {
				await tx
					.update(eventSessions)
					.set({
						availableCapacity: session.availableCapacity + reservation.quantity,
						updatedAt: new Date(),
					})
					.where(eq(eventSessions.id, reservation.eventSessionId));
			}

			// Process refund if payment exists
			if (reservation.paymentId) {
				const payment = await tx.query.payments.findFirst({
					where: eq(payments.id, reservation.paymentId),
				});

				if (payment && payment.status === 'succeeded') {
					// Import Stripe and process refund
					try {
						const stripe = await import('stripe');
						const stripeInstance = new stripe.default(process.env.STRIPE_SECRET_KEY || '');

						if (payment.stripePaymentIntentId) {
							// Get the payment intent to find the charge
							const paymentIntent = await stripeInstance.paymentIntents.retrieve(
								payment.stripePaymentIntentId
							);

							if (paymentIntent.latest_charge) {
								const chargeId = typeof paymentIntent.latest_charge === 'string'
									? paymentIntent.latest_charge
									: paymentIntent.latest_charge?.id;

								if (chargeId) {
									await stripeInstance.refunds.create({
										charge: chargeId,
										reason: 'requested_by_customer',
									});
								}
							}
						}

						// Update payment status
						await tx
							.update(payments)
							.set({
								status: 'refunded',
								refundedAmount: payment.amount,
								updatedAt: new Date(),
							})
							.where(eq(payments.id, payment.id));

						refund = { amount: payment.amount, currency: payment.currency };
					} catch (stripeError) {
						logger.error({ err: stripeError }, 'Failed to process Stripe refund');
						// Don't fail the cancellation if refund fails
						// The reservation is cancelled but refund needs manual processing
					}
				}
			}

			return refund;
		});

		logger.info(`Reservation ${reservation.id} cancelled by user`);

		// Send cancellation/refund confirmation email — a refund notification if
		// a refund actually went through, otherwise a plain cancellation notice
		// (e.g. no payment attached, or the Stripe refund failed above).
		try {
			if (refundResult) {
				const { sendRefundEmail } = await import('$lib/server/services/email');
				await sendRefundEmail({
					guestEmail: reservation.guestEmail,
					guestName: reservation.guestName,
					eventTitle: reservation.eventSession.event.titleEn,
					sessionTitle: seatingTitle(reservation.eventSession, 'en'),
					sessionStartTime: reservation.eventSession.startTime,
					reservationId: reservation.id,
					amount: refundResult.amount,
					currency: refundResult.currency,
					isPartialRefund: false,
				});
			} else {
				const { sendCancellationEmail } = await import('$lib/server/services/email');
				await sendCancellationEmail({
					guestEmail: reservation.guestEmail,
					guestName: reservation.guestName,
					eventTitle: reservation.eventSession.event.titleEn,
					sessionTitle: seatingTitle(reservation.eventSession, 'en'),
					sessionStartTime: reservation.eventSession.startTime,
					reservationId: reservation.id,
				});
			}
		} catch (emailError) {
			logger.error({ err: emailError }, 'Failed to send cancellation email');
		}

		// Send SMS if the guest opted in and has a phone number on file
		if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
			try {
				if (refundResult) {
					const { sendRefundSMS } = await import('$lib/server/services/sms');
					await sendRefundSMS({
						phone: reservation.guestPhone,
						name: reservation.guestName,
						eventTitle: reservation.eventSession.event.titleEn,
						amount: refundResult.amount,
						currency: refundResult.currency,
					});
				} else {
					const { sendCancellationSMS } = await import('$lib/server/services/sms');
					await sendCancellationSMS({
						phone: reservation.guestPhone,
						name: reservation.guestName,
						eventTitle: reservation.eventSession.event.titleEn,
						sessionStartTime: reservation.eventSession.startTime,
					});
				}
			} catch (smsError) {
				logger.error({ err: smsError }, 'Failed to send cancellation SMS');
				// Don't throw - email might have been sent
			}
		}

		return json({ success: true, refund: refundResult });
	} catch (error) {
		logger.error({ err: error }, 'Failed to cancel reservation');
		return json({ error: 'Failed to cancel reservation' }, { status: 500 });
	}
};

// GET /api/reservations/[token]/cancel - Check if reservation can be cancelled
export const GET: RequestHandler = async ({ params }) => {
	const { token } = params;

	try {
		const reservation = await getReservationByToken(token);

		if (!reservation) {
			return json({ error: 'Reservation not found' }, { status: 404 });
		}

		const terms = await getGuestCancellationTerms(reservation.id);

		return json({
			canCancel: terms.canCancel,
			reason: terms.canCancel ? null : terms.reason,
			// The refund the guest would get if they cancel now (minor units).
			refund: terms.canCancel ? { amount: terms.refundAmount, currency: terms.currency } : null,
			reservation: {
				id: reservation.id,
				status: reservation.status,
				eventTitle: reservation.eventSession.event.titleEn,
				sessionTitle: seatingTitle(reservation.eventSession, 'en'),
				sessionStartTime: reservation.eventSession.startTime,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to check cancellation status');
		return json({ error: 'Failed to check cancellation status' }, { status: 500 });
	}
};

/**
 * What happens after a Reservation's cancellation has committed (security
 * audit, Module 2): the Stripe refund — never while a Seating row lock is
 * held, always with an idempotency key — and the waitlist and guest
 * notifications. Every cancel path (guest, Admin API, Admin detail page)
 * runs the Reservation transitions module's conditional cancel first and
 * these only if it won.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { payments } from '../db/schema';
import { logger } from '$lib/server/logger';
import { seatingTitle } from '$lib/utils/seating-title';

/** What the guest notifications need of a Reservation. */
export interface ReservationForNotification {
	id: string;
	guestEmail: string | null;
	guestName: string;
	guestPhone: string | null;
	notificationPreference: string;
	eventSession: {
		startTime: Date;
		event: { titleEn: string; timeZone: string };
	} & Parameters<typeof seatingTitle>[0];
}

/** What a refund needs of a payment. */
export interface PaymentForRefund {
	id: string;
	stripePaymentIntentId: string;
	currency: string;
	refundedAmount: number;
}

/**
 * Refund a cancelled Reservation's payment, after the cancellation has
 * committed (never under a Seating row lock), through the Stripe service
 * with an idempotency key, so a retried call can't refund twice. Records
 * the refund on the payment only if nothing was recorded since `payment`
 * was read: two calls racing with the same key get the same Stripe refund,
 * and only one adds it. A Stripe failure is logged and recorded on the
 * payment for manual handling, and answers null.
 */
export async function refundAfterCancellation(
	payment: PaymentForRefund,
	amount: number,
	idempotencyKey: string
): Promise<{ amount: number; currency: string } | null> {
	try {
		const { createRefund } = await import('./stripe');
		const refund = await createRefund(payment.stripePaymentIntentId, amount, { idempotencyKey });
		await db
			.update(payments)
			.set({
				refundedAmount: sql`${payments.refundedAmount} + ${refund.amount}`,
				status: sql`CASE WHEN ${payments.refundedAmount} + ${refund.amount} >= ${payments.amount} THEN 'refunded'::payment_status ELSE 'partially_refunded'::payment_status END`,
				updatedAt: new Date(),
			})
			.where(and(eq(payments.id, payment.id), eq(payments.refundedAmount, payment.refundedAmount)));
		return { amount: refund.amount, currency: payment.currency };
	} catch (error) {
		logger.error({ err: error, paymentId: payment.id }, 'Refund after cancellation failed; needs manual handling');
		await db
			.update(payments)
			.set({ lastError: `Refund failed: ${error instanceof Error ? error.message : String(error)}`, updatedAt: new Date() })
			.where(eq(payments.id, payment.id))
			.catch((err: unknown) => logger.error({ err }, 'Failed to record the refund failure'));
		return null;
	}
}

/** Tell the waitlist about seats a winning cancellation freed (best-effort). */
export async function notifyWaitlistOfFreedSeats(outcome: { eventSessionId: string; quantity: number; allowWaitlist: boolean }) {
	if (!outcome.allowWaitlist || outcome.quantity <= 0) return;
	try {
		const { notifyWaitlist } = await import('./waitlist');
		await notifyWaitlist(outcome.eventSessionId, outcome.quantity);
	} catch (error) {
		logger.error({ err: error }, '[Waitlist] Failed to notify');
	}
}

/**
 * Notify the guest of their cancellation, after the commit: a refund
 * notification if a refund went through, otherwise a plain cancellation
 * notification — by email, and by SMS if they opted in. Best-effort.
 */
export async function notifyGuestOfCancellation(
	reservation: ReservationForNotification,
	refund: { amount: number; currency: string } | null,
	options: { isPartialRefund?: boolean } = {}
) {
	const { eventSession } = reservation;
	const timeZone = eventSession.event.timeZone;
	const sessionTitle = seatingTitle(eventSession, 'en', { timeZone });

	try {
		const email = await import('./email');
		if (refund) {
			await email.sendRefundEmail({
				guestEmail: reservation.guestEmail,
				guestName: reservation.guestName,
				eventTitle: eventSession.event.titleEn,
				sessionTitle,
				sessionStartTime: eventSession.startTime,
				timeZone,
				reservationId: reservation.id,
				amount: refund.amount,
				currency: refund.currency,
				isPartialRefund: options.isPartialRefund ?? false,
			});
		} else {
			await email.sendCancellationEmail({
				guestEmail: reservation.guestEmail,
				guestName: reservation.guestName,
				eventTitle: eventSession.event.titleEn,
				sessionTitle,
				sessionStartTime: eventSession.startTime,
				timeZone,
				reservationId: reservation.id,
			});
		}
	} catch (error) {
		logger.error({ err: error }, 'Failed to send cancellation email');
	}

	if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
		try {
			const sms = await import('./sms');
			if (refund) {
				await sms.sendRefundSMS({
					phone: reservation.guestPhone,
					name: reservation.guestName,
					eventTitle: eventSession.event.titleEn,
					amount: refund.amount,
					currency: refund.currency,
				});
			} else {
				await sms.sendCancellationSMS({
					phone: reservation.guestPhone,
					name: reservation.guestName,
					eventTitle: eventSession.event.titleEn,
					sessionStartTime: eventSession.startTime,
					timeZone,
				});
			}
		} catch (error) {
			logger.error({ err: error }, 'Failed to send cancellation SMS');
		}
	}
}

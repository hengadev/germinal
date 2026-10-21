/**
 * Cancelling a Reservation with the refund its Event's Refund Policy gives
 * (issue 028).
 *
 * - {@link getCancellationQuote}: what the admin cancel screen pre-fills —
 *   the refundable amount (Deposit paid minus anything already refunded),
 *   the policy's suggestion for a guest-requested cancellation and its
 *   reason in French, and the full refund of a Germinal cancellation.
 * - {@link cancelWithRefund}: cancels and refunds the amount the Admin
 *   confirmed (forced to the full refundable amount when Germinal cancels),
 *   through the existing paths: {@link processRefund} for a refund (partial
 *   or full; it also frees the seats) and {@link cancelReservation} when
 *   nothing is refunded.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { payments, reservations } from '../db/schema';
import { logger } from '$lib/server/logger';
import { seatingTitle } from '$lib/utils/seating-title';
import { cancelReservationTransition } from './reservation-transitions';
import { refundPolicyOf } from '$lib/utils/refund-policy';
import {
	cancellationPreFill,
	guestCancellationTerms,
	refundableAmount,
	type CancellationPreFill,
	type CancelledBy,
	type GuestCancellationTerms,
} from '$lib/utils/cancellation-refund';
import { cancelReservation, processRefund } from './reservations';

/** A cancellation refused for a reason the Admin can act on (French). */
export class CancellationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CancellationError';
	}
}

export interface CancellationQuote extends CancellationPreFill {
	reservationId: string;
	status: string;
	currency: string;
	seatingStart: Date;
}

async function loadForCancellation(reservationId: string) {
	const reservation = await db.query.reservations.findFirst({
		where: eq(reservations.id, reservationId),
		with: {
			payment: true,
			eventSession: { with: { event: true } },
		},
	});
	if (!reservation) throw new CancellationError('Réservation introuvable');
	return reservation;
}

/** The cancel screen's pre-fill for a Reservation, as of `now`. */
export async function getCancellationQuote(reservationId: string, now: Date = new Date()): Promise<CancellationQuote> {
	const reservation = await loadForCancellation(reservationId);
	const seatingStart = reservation.eventSession.startTime;
	return {
		reservationId,
		status: reservation.status,
		currency: reservation.currency,
		seatingStart,
		...cancellationPreFill({
			policy: refundPolicyOf(reservation.eventSession.event),
			seatingStart,
			now,
			refundable: refundableAmount(reservation.payment),
		}),
	};
}

export interface CancelWithRefundResult {
	cancelledBy: CancelledBy;
	/** What the policy suggested (null: manual policy, nothing suggested). */
	suggestedAmount: number | null;
	/** What was actually refunded, minor units. */
	appliedAmount: number;
	refundable: number;
	currency: string;
}

/**
 * Cancel a Reservation and refund `amount` (minor units) of its Deposit.
 * - `cancelledBy: 'germinal'`: `amount` is ignored, the whole refundable
 *   amount is refunded;
 * - `cancelledBy: 'guest'`: `amount` (0 ≤ amount ≤ refundable) is what the
 *   Admin confirmed; when omitted, the policy's suggestion applies (refused
 *   for a manual policy, which suggests nothing).
 */
export async function cancelWithRefund(
	reservationId: string,
	options: { cancelledBy: CancelledBy; amount?: number; now?: Date }
): Promise<CancelWithRefundResult> {
	const quote = await getCancellationQuote(reservationId, options.now);
	if (quote.status === 'cancelled') throw new CancellationError('Cette réservation est déjà annulée');
	if (quote.status === 'expired') throw new CancellationError('Cette réservation a expiré');

	const suggestedAmount = options.cancelledBy === 'germinal' ? quote.germinalAmount : quote.suggestedAmount;

	let appliedAmount: number;
	if (options.cancelledBy === 'germinal') {
		appliedAmount = quote.germinalAmount;
	} else if (options.amount !== undefined) {
		appliedAmount = options.amount;
	} else if (suggestedAmount !== null) {
		appliedAmount = suggestedAmount;
	} else {
		throw new CancellationError('Indiquez le montant à rembourser (politique manuelle)');
	}

	if (!Number.isInteger(appliedAmount) || appliedAmount < 0) {
		throw new CancellationError('Le montant à rembourser doit être positif ou nul');
	}
	if (appliedAmount > quote.refundable) {
		throw new CancellationError('Le montant à rembourser dépasse le montant remboursable');
	}

	if (appliedAmount > 0) {
		await processRefund(reservationId, appliedAmount, { cancelling: true });
	} else {
		await cancelReservation(reservationId);
	}

	return {
		cancelledBy: options.cancelledBy,
		suggestedAmount,
		appliedAmount,
		refundable: quote.refundable,
		currency: quote.currency,
	};
}

/** Whether the guest may cancel from their Ticket now, and the refund. */
export async function getGuestCancellationTerms(
	reservationId: string,
	now: Date = new Date()
): Promise<GuestCancellationTerms & { currency: string }> {
	const reservation = await loadForCancellation(reservationId);
	const terms = guestCancellationTerms({
		status: reservation.status,
		policy: refundPolicyOf(reservation.eventSession.event),
		seatingStart: reservation.eventSession.startTime,
		now,
		refundable: refundableAmount(reservation.payment),
	});
	return { ...terms, currency: reservation.currency };
}

/**
 * A guest's self-service cancellation from their Ticket, for both kinds of
 * Refund Policy: the terms decide the refund (the full refundable amount
 * under a manual policy's 24-hour rule, the policy's amount otherwise).
 *
 * The cancellation is the Reservation transitions module's conditional
 * confirmed → cancelled: of several parallel requests exactly one wins and
 * restores capacity; the others are refused like any Reservation that is no
 * longer confirmed. Only the winner refunds — through the Stripe service,
 * after the commit, with an idempotency key derived from the Reservation —
 * and notifies the guest: a refund notification if a refund went through,
 * otherwise a plain cancellation one. A refund failure leaves the
 * Reservation cancelled and is logged for manual handling.
 */
export async function cancelByGuest(
	reservationId: string,
	now: Date = new Date()
): Promise<{ refundAmount: number; currency: string }> {
	const reservation = await loadForCancellation(reservationId);
	const terms = guestCancellationTerms({
		status: reservation.status,
		policy: refundPolicyOf(reservation.eventSession.event),
		seatingStart: reservation.eventSession.startTime,
		now,
		refundable: refundableAmount(reservation.payment),
	});
	if (!terms.canCancel) throw new CancellationError(terms.reason);

	const outcome = await cancelReservationTransition(reservationId);
	if (!outcome.won) throw new CancellationError('Reservation is not confirmed');

	await notifyWaitlistOfFreedSeats(outcome);

	const refund =
		terms.refundAmount > 0 && reservation.payment
			? await refundAfterCancellation(reservation.payment, terms.refundAmount, `guest-cancel-refund-${reservationId}`)
			: null;

	await notifyGuestOfCancellation(reservation, refund);

	return { refundAmount: refund?.amount ?? 0, currency: reservation.currency };
}

type ReservationForCancellation = Awaited<ReturnType<typeof loadForCancellation>>;
type PaymentForRefund = NonNullable<ReservationForCancellation['payment']>;

/**
 * Refund a cancelled Reservation's payment, after the cancellation has
 * committed (never under a Seating row lock), through the Stripe service
 * with an idempotency key, so a retried call can't refund twice. Records
 * the refund on the payment. A Stripe failure is logged and recorded on the
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
			.where(eq(payments.id, payment.id));
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
	reservation: ReservationForCancellation,
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

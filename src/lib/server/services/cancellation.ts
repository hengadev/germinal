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

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { reservations } from '../db/schema';
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
 * A guest's self-service cancellation on an Event with a rule-based Refund
 * Policy: refunds the policy's amount through {@link processRefund}, or
 * just cancels (freeing the seats) when it is nothing. Both send the guest
 * their notification. Manual-policy Events keep the Ticket's historical
 * full-refund path (see the cancel endpoint); this refuses them.
 */
export async function cancelByGuestWithPolicy(
	reservationId: string,
	now: Date = new Date()
): Promise<{ refundAmount: number; currency: string }> {
	const terms = await getGuestCancellationTerms(reservationId, now);
	if (!terms.canCancel) throw new CancellationError(terms.reason);
	if (terms.mode !== 'policy') throw new CancellationError('This Event has no rule-based Refund Policy');

	if (terms.refundAmount > 0) {
		await processRefund(reservationId, terms.refundAmount, { cancelling: true });
	} else {
		await cancelReservation(reservationId);
	}
	return { refundAmount: terms.refundAmount, currency: terms.currency };
}

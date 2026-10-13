/**
 * Cancellation refunds (issue 028) — pure and client-safe.
 *
 * When a Reservation is cancelled, the refund suggested to the Admin (and
 * applied on a guest's self-service cancellation of a rule-based Event)
 * comes from the Event's Refund Policy ({@link refundFor}), applied to what
 * can still be refunded: the Deposit paid online minus anything already
 * refunded. This module computes that suggestion and explains it in French
 * for the back-office.
 */

import {
	describeRefundPolicy,
	refundFor,
	type RefundDecision,
	type RefundPolicy,
} from './refund-policy';

/** Who is behind a cancellation: the guest asked for it, or Germinal
 * cancels (the Seating or the Event) and refunds the whole Deposit. */
export type CancelledBy = 'guest' | 'germinal';

export const CANCELLED_BY = ['guest', 'germinal'] as const satisfies readonly CancelledBy[];

/**
 * What a Reservation's payment can still refund, in minor units: the amount
 * paid online (the Deposit) minus what was already refunded, for a payment
 * that went through. Nothing without a payment (no Deposit, comp) or when
 * the payment never succeeded.
 */
export function refundableAmount(
	payment: { amount: number; refundedAmount: number | null; status: string } | null | undefined
): number {
	if (!payment) return 0;
	if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') return 0;
	return Math.max(0, payment.amount - (payment.refundedAmount ?? 0));
}

/**
 * The refund suggested for a cancellation: the Refund Policy applied to the
 * refundable amount, or `manual` when an Admin has to decide.
 */
export function suggestCancellationRefund(input: {
	policy: RefundPolicy;
	seatingStart: Date;
	cancelledAt: Date;
	refundable: number;
	cancelledBy: CancelledBy;
}): RefundDecision {
	return refundFor({
		policy: input.policy,
		seatingStart: input.seatingStart,
		cancelledAt: input.cancelledAt,
		deposit: input.refundable,
		cancelledBy: input.cancelledBy,
	});
}

const NBSP = '\u00a0';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Time left before the Seating, in French: minutes under an hour, hours
 * up to three days, then whole days ("45 min", "31 h", "5 jours"). */
export function formatTimeLeftFr(ms: number): string {
	const left = Math.max(0, ms);
	if (left < HOUR_MS) return `${Math.floor(left / MINUTE_MS)}${NBSP}min`;
	const hours = Math.floor(left / HOUR_MS);
	if (hours < 72) return `${hours}${NBSP}h`;
	const days = Math.floor(hours / 24);
	return `${days}${NBSP}jours`;
}

/**
 * Why the suggested refund is what it is, in French, for the Admin, e.g.
 * « Palier appliqué : 50 % jusqu'à 24 h avant la séance — il reste 31 h ».
 */
export function describeCancellationRefundFr(
	decision: RefundDecision,
	times: { seatingStart: Date; cancelledAt: Date }
): string {
	if (decision.kind === 'manual') {
		return 'Politique manuelle : le montant du remboursement est à décider';
	}
	const left = `il reste ${formatTimeLeftFr(times.seatingStart.getTime() - times.cancelledAt.getTime())}`;
	switch (decision.basis.type) {
		case 'germinal':
			return 'Annulé par Germinal : remboursement intégral de l’acompte';
		case 'started':
			return 'Séance déjà commencée : aucun remboursement selon la politique';
		case 'too-late':
			return `Trop tard pour un remboursement selon la politique — ${left}`;
		case 'tier': {
			const { tier } = decision.basis;
			const when =
				tier.hoursBefore === 0
					? 'jusqu’au début de la séance'
					: `jusqu’à ${formatTimeLeftFr(tier.hoursBefore * HOUR_MS)} avant la séance`;
			return `Palier appliqué : ${tier.percent}${NBSP}% ${when} — ${left}`;
		}
	}
}

/** The admin cancel screen's pre-fill (serialisable). */
export interface CancellationPreFill {
	/** What can still be refunded, minor units: the most the Admin may enter. */
	refundable: number;
	policyType: RefundPolicy['type'];
	/** The policy in French plain words (the manual statement, or the
	 * tiers), null when there is nothing to show. */
	policyTextFr: string | null;
	/** Guest-requested: the policy's amount, null for a manual policy (the
	 * Admin types it). */
	suggestedAmount: number | null;
	suggestedReasonFr: string;
	/** Germinal cancels: the whole refundable amount. */
	germinalAmount: number;
	germinalReasonFr: string;
}

/** What the admin cancel screen pre-fills for a cancellation at `now`. */
export function cancellationPreFill(input: {
	policy: RefundPolicy;
	seatingStart: Date;
	now: Date;
	refundable: number;
}): CancellationPreFill {
	const times = { seatingStart: input.seatingStart, cancelledAt: input.now };
	const base = { policy: input.policy, ...times, refundable: input.refundable };
	const suggestion = suggestCancellationRefund({ ...base, cancelledBy: 'guest' });
	const germinal = suggestCancellationRefund({ ...base, cancelledBy: 'germinal' });
	return {
		refundable: input.refundable,
		policyType: input.policy.type,
		policyTextFr: describeRefundPolicy(input.policy, 'fr'),
		suggestedAmount: suggestion.kind === 'refund' ? suggestion.amount : null,
		suggestedReasonFr: describeCancellationRefundFr(suggestion, times),
		germinalAmount: germinal.kind === 'refund' ? germinal.amount : input.refundable,
		germinalReasonFr: describeCancellationRefundFr(germinal, times),
	};
}

// ---------------------------------------------------------------------------
// Guest self-service cancellation (from the Ticket)
// ---------------------------------------------------------------------------

/** How long before the Seating a guest may still cancel from their Ticket
 * when the Event has a manual Refund Policy — what migrated Events' manual
 * statement promises (migration 0023). */
export const MANUAL_POLICY_CANCELLATION_WINDOW_HOURS = 24;

export type GuestCancellationTerms =
	| { canCancel: false; reason: string }
	| {
			canCancel: true;
			/**
			 * - `full-refund`: manual policy — the historical self-service
			 *   rule, a full refund of what was paid online;
			 * - `policy`: rule-based policy — the refund {@link refundFor}
			 *   gives (possibly 0: cancelling still frees the seats).
			 */
			mode: 'full-refund' | 'policy';
			/** The refund the guest will get, minor units. */
			refundAmount: number;
	  };

/**
 * Whether a guest may cancel their Reservation from the Ticket, and the
 * refund they would get.
 * - Only confirmed Reservations, and never once the Seating has started.
 * - Manual policy: allowed up to {@link MANUAL_POLICY_CANCELLATION_WINDOW_HOURS}
 *   hours before the Seating, with a full refund — unchanged behaviour.
 * - Rule-based policy: allowed until the Seating starts; the refund is the
 *   policy's (guest-requested) amount.
 * Reasons are English (the API's language); the Ticket maps them to i18n.
 */
export function guestCancellationTerms(input: {
	status: string;
	policy: RefundPolicy;
	seatingStart: Date;
	now: Date;
	refundable: number;
}): GuestCancellationTerms {
	if (input.status !== 'confirmed') {
		return { canCancel: false, reason: 'Reservation is not confirmed' };
	}
	const leftMs = input.seatingStart.getTime() - input.now.getTime();

	const decision = suggestCancellationRefund({
		policy: input.policy,
		seatingStart: input.seatingStart,
		cancelledAt: input.now,
		refundable: input.refundable,
		cancelledBy: 'guest',
	});

	if (decision.kind === 'manual') {
		if (leftMs < MANUAL_POLICY_CANCELLATION_WINDOW_HOURS * HOUR_MS) {
			return {
				canCancel: false,
				reason: `Cancellation is only available more than ${MANUAL_POLICY_CANCELLATION_WINDOW_HOURS} hours before the event`,
			};
		}
		return { canCancel: true, mode: 'full-refund', refundAmount: input.refundable };
	}

	if (leftMs <= 0) {
		return { canCancel: false, reason: 'The seating has already started' };
	}
	return { canCancel: true, mode: 'policy', refundAmount: decision.amount };
}

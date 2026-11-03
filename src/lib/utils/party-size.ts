/**
 * Party size (issue 046): the quote for changing a confirmed
 * Reservation's number of Guests. Pure, in cents: the Admin dialog runs it
 * live as the number changes, and the service applies it inside the
 * transaction on freshly locked rows.
 *
 * Money rules (CONTEXT.md / PRD): the price per Guest is the total ÷ the
 * quantity, so a Promo Code discount carries over. Guests added pay their
 * whole price on site (the Deposit never grows); Guests removed come off
 * the Balance first, never below 0 — whatever falls beyond is over-paid,
 * and the quote suggests refunding it under the Event's Refund Policy
 * (issue 047): the same rule a Guest's cancellation follows, applied to
 * the over-paid amount. A Comp changes only its quantity: every amount
 * stays 0.
 */

import {
	describeCancellationRefundFr,
	suggestCancellationRefund,
} from './cancellation-refund';
import type { RefundPolicy } from './refund-policy';

export interface PartySizeInput {
	/** The Reservation's current number of Guests. */
	quantity: number;
	/** total_amount, in cents. */
	total: number;
	/** The Extras' share of `total` (issue 068): kept as it is when the
	 * party changes size — only the meal scales. Defaults to 0. */
	extrasTotal?: number;
	/** The Deposit actually paid online, minus refunds, in cents. */
	depositPaid: number;
	/** balance_amount, in cents. */
	balance: number;
	isComp: boolean;
	/** Guests already checked in (sum of the Reservation's Check-ins). */
	checkedIn: number;
	/** Only a confirmed Reservation can change size. */
	status: string;
	/** The Event's Refund Policy, for the over-paid refund suggestion
	 * (issue 047). Without it an over-paid change is still allowed, just
	 * without a suggestion. */
	refundPolicy?: RefundPolicy;
	/** The Seating's start, on the Event's clock, for the policy's tiers. */
	seatingStart?: Date;
	/** When the change happens, for the policy's tiers. */
	now?: Date;
	/** Issue 048: when false (a Staff member without cancel_refund), a
	 * removal that goes past the Balance is refused instead of over-paying. */
	allowOverPay?: boolean;
}

export interface PartySizeQuote {
	/** The new number of Guests. */
	quantity: number;
	/** The new total, in cents. */
	total: number;
	/** The new Balance to collect on site, in cents. */
	balance: number;
	/** What the Guest would be over-paid by this change, in cents: the
	 * removal goes past the Balance into the Deposit already paid. */
	overPaid: number;
	/** The price per Guest the change is priced at, in cents. */
	pricePerGuest: number;
	/** What the policy suggests refunding of the over-paid amount, in
	 * cents, and why in French (as the cancel screen's reason): null when
	 * nothing is over-paid or no policy was given. Under a manual policy
	 * the whole over-paid amount is suggested. */
	overPaidRefund: { amount: number; reasonFr: string } | null;
}

export type PartySizeResult = { ok: true; quote: PartySizeQuote } | { ok: false; error: string };

export function quotePartySize(input: PartySizeInput, newQuantity: number): PartySizeResult {
	if (input.status !== 'confirmed') {
		return { ok: false, error: 'Cette réservation n’est pas confirmée.' };
	}
	if (!Number.isInteger(newQuantity) || newQuantity < 1) {
		return { ok: false, error: 'Le nombre de personnes doit être au moins 1.' };
	}
	if (newQuantity < input.checkedIn) {
		return {
			ok: false,
			error: `Le nombre ne peut pas descendre sous les ${input.checkedIn} personnes déjà arrivées.`,
		};
	}
	if (newQuantity === input.quantity) {
		return {
			ok: true,
			quote: {
				quantity: input.quantity,
				total: input.total,
				balance: input.balance,
				overPaid: 0,
				pricePerGuest: input.isComp ? 0 : Math.round((input.total - (input.extrasTotal ?? 0)) / input.quantity),
				overPaidRefund: null,
			},
		};
	}

	// A Comp: only the quantity moves, no money involved.
	if (input.isComp) {
		return {
			ok: true,
			quote: { quantity: newQuantity, total: 0, balance: 0, overPaid: 0, pricePerGuest: 0, overPaidRefund: null },
		};
	}

	const extrasTotal = input.extrasTotal ?? 0;
	const mealTotal = input.total - extrasTotal;
	const pricePerGuest = Math.round(mealTotal / input.quantity);
	// The meal scales with the party, the Extras keep their total (issue
	// 068 — per-person Extras keep their booked quantity); scaled from the
	// meal total rather than added per Guest, so going back to the original
	// number gives back the original total, cent for cent.
	const total = extrasTotal + Math.round((mealTotal * newQuantity) / input.quantity);
	// Removals come off the Balance first, never below 0.
	const balance = Math.max(input.balance + (total - input.total), 0);
	// Beyond the Balance, the change eats into the Deposit already paid:
	// over-paid, refundable under the Refund Policy (issue 047).
	const overPaid = Math.max(input.depositPaid - (total - balance), 0);
	if (overPaid > 0 && input.allowOverPay === false) {
		return {
			ok: false,
			error:
			'La suppression va au-delà du solde : la rembourser exige la permission « Annuler et rembourser ».',
		};
	}
	let overPaidRefund: PartySizeQuote['overPaidRefund'] = null;
	if (overPaid > 0 && input.refundPolicy && input.seatingStart && input.now) {
		const times = { seatingStart: input.seatingStart, cancelledAt: input.now };
		const decision = suggestCancellationRefund({
			policy: input.refundPolicy,
			...times,
			refundable: overPaid,
			cancelledBy: 'guest',
		});
		// A manual policy: the Admin decides — pre-fill the whole amount.
		overPaidRefund = {
			amount: decision.kind === 'refund' ? decision.amount : overPaid,
			reasonFr: describeCancellationRefundFr(decision, times),
		};
	}
	return {
		ok: true,
		quote: { quantity: newQuantity, total, balance, overPaid, pricePerGuest, overPaidRefund },
	};
}

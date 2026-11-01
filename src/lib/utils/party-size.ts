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
 * and refunding it is issue 047, so in this issue such a removal is
 * refused. A Comp changes only its quantity: every amount stays 0.
 */

export interface PartySizeInput {
	/** The Reservation's current number of Guests. */
	quantity: number;
	/** total_amount, in cents. */
	total: number;
	/** The Deposit actually paid online, minus refunds, in cents. */
	depositPaid: number;
	/** balance_amount, in cents. */
	balance: number;
	isComp: boolean;
	/** Guests already checked in (sum of the Reservation's Check-ins). */
	checkedIn: number;
	/** Only a confirmed Reservation can change size. */
	status: string;
}

export interface PartySizeQuote {
	/** The new number of Guests. */
	quantity: number;
	/** The new total, in cents. */
	total: number;
	/** The new Balance to collect on site, in cents. */
	balance: number;
	/** What the Guest would be over-paid by this change, in cents (0 here:
	 * a removal that over-pays is refused until issue 047 refunds it). */
	overPaid: number;
	/** The price per Guest the change is priced at, in cents. */
	pricePerGuest: number;
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
				pricePerGuest: input.isComp ? 0 : Math.round(input.total / input.quantity),
			},
		};
	}

	// A Comp: only the quantity moves, no money involved.
	if (input.isComp) {
		return {
			ok: true,
			quote: { quantity: newQuantity, total: 0, balance: 0, overPaid: 0, pricePerGuest: 0 },
		};
	}

	const pricePerGuest = Math.round(input.total / input.quantity);
	// Scaled from the total rather than added per Guest, so going back to
	// the original number gives back the original total, cent for cent.
	const total = Math.round((input.total * newQuantity) / input.quantity);
	// Removals come off the Balance first, never below 0.
	const balance = Math.max(input.balance + (total - input.total), 0);
	// Beyond the Balance, the change eats into the Deposit already paid:
	// over-paid, refundable (issue 047) — refused for now.
	const overPaid = Math.max(input.depositPaid - (total - balance), 0);
	if (overPaid > 0) {
		return {
			ok: false,
			error:
				'Cette réduction laisserait un trop-perçu à rembourser, ce n’est pas encore possible.',
		};
	}
	return { ok: true, quote: { quantity: newQuantity, total, balance, overPaid: 0, pricePerGuest } };
}

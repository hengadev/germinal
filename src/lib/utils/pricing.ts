/**
 * Pricing (issue 023) — pure, shared by the server (reservation creation),
 * the public booking UI, the Ticket and the admin price preview.
 *
 * Given a unit price, a seat count, an optional Promo Code discount and the
 * Event's Deposit rule, it works out what the Reservation costs and how
 * that splits between the Deposit (paid online) and the Balance (paid at
 * the venue), all in minor units (cents):
 *
 * - the Promo Code discounts the price of the meal, never below zero;
 * - a percentage Deposit is taken on the discounted total;
 * - a fixed Deposit is per seat;
 * - the Deposit never exceeds the total;
 * - with no Deposit, nothing is paid online (deposit 0, balance = total);
 * - Balance = total − Deposit, always.
 *
 * Rounding: percentages (Promo Code and Deposit) are rounded to the cent,
 * half-up — exact integer arithmetic, so 50 % of 1,05 € is 0,53 €.
 *
 * Full payment online is a percentage Deposit of 100 % — the rule Events
 * get by default and the one existing Events were migrated to (0022).
 */

export const DEPOSIT_TYPES = ['none', 'fixed', 'percent'] as const;
export type DepositType = (typeof DEPOSIT_TYPES)[number];

/**
 * An Event's Deposit rule.
 * - `none`: no Deposit, `value` is 0;
 * - `fixed`: `value` is the Deposit per seat, in minor units (> 0);
 * - `percent`: `value` is a whole percentage of the price, 1..100.
 */
export interface DepositRule {
	type: DepositType;
	value: number;
}

/** Full payment online: the default rule, and that of migrated Events. */
export const FULL_PAYMENT_DEPOSIT: DepositRule = { type: 'percent', value: 100 };

/** Upper bound on a fixed Deposit per seat (minor units): 100 000.00. */
export const MAX_FIXED_DEPOSIT = 10_000_000;

/** A Promo Code's discount, as Coupons define it. `percent`: whole
 * percentage; `amount`: minor units off the whole Reservation. */
export interface PromoDiscount {
	discountType: 'percent' | 'amount';
	discountValue: number;
}

export interface PriceBreakdown {
	/** Unit price × seats. */
	subtotal: number;
	/** Promo Code discount, never more than the subtotal. */
	discount: number;
	/** What the Reservation costs: subtotal − discount. */
	total: number;
	/** Paid online when booking. */
	deposit: number;
	/** Due at the venue: total − deposit. */
	balance: number;
}

/** `percent` % of `amount` (both non-negative integers), rounded to the
 * cent half-up with integer arithmetic. Shared with the Refund Policy
 * module (issue 027) so every percentage is rounded the same way. */
export function percentOf(amount: number, percent: number): number {
	return Math.floor((amount * percent + 50) / 100);
}

/** The Promo Code discount on a subtotal: never negative, never more than
 * the subtotal. */
export function discountAmount(discount: PromoDiscount, subtotal: number): number {
	const raw = discount.discountType === 'percent'
		? percentOf(subtotal, discount.discountValue)
		: discount.discountValue;
	return Math.min(Math.max(raw, 0), subtotal);
}

/** The Deposit on a (discounted) total for `seats` seats, capped at the
 * total. */
export function depositAmount(rule: DepositRule, total: number, seats: number): number {
	let deposit: number;
	switch (rule.type) {
		case 'none':
			deposit = 0;
			break;
		case 'fixed':
			deposit = rule.value * seats;
			break;
		case 'percent':
			deposit = percentOf(total, rule.value);
			break;
	}
	return Math.min(Math.max(deposit, 0), total);
}

/** Price a Reservation: see the module comment for the rules. */
export function priceReservation(input: {
	/** Unit price per seat, minor units. */
	unitPrice: number;
	seats: number;
	discount?: PromoDiscount | null;
	deposit: DepositRule;
}): PriceBreakdown {
	const subtotal = input.unitPrice * input.seats;
	const discount = input.discount ? discountAmount(input.discount, subtotal) : 0;
	const total = subtotal - discount;
	const deposit = depositAmount(input.deposit, total, input.seats);
	return { subtotal, discount, total, deposit, balance: total - deposit };
}

/** Whether a rule is valid: the combinations the database accepts. */
export function isValidDepositRule(rule: DepositRule): boolean {
	if (!Number.isInteger(rule.value)) return false;
	switch (rule.type) {
		case 'none':
			return rule.value === 0;
		case 'fixed':
			return rule.value > 0 && rule.value <= MAX_FIXED_DEPOSIT;
		case 'percent':
			return rule.value >= 1 && rule.value <= 100;
		default:
			return false;
	}
}

/** An Event's Deposit rule from its `depositType`/`depositValue` columns;
 * an Event without them (mock data) takes full payment online. */
export function depositRuleOf(event: object): DepositRule {
	const { depositType, depositValue } = event as { depositType?: unknown; depositValue?: unknown };
	if (
		typeof depositType !== 'string' ||
		!(DEPOSIT_TYPES as readonly string[]).includes(depositType) ||
		typeof depositValue !== 'number'
	) {
		return FULL_PAYMENT_DEPOSIT;
	}
	return { type: depositType as DepositType, value: depositValue };
}

/** Whether the rule makes the Guest pay the whole price online. */
export function isFullPayment(rule: DepositRule): boolean {
	return rule.type === 'percent' && rule.value === 100;
}

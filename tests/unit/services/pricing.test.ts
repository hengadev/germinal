import { describe, it, expect } from 'vitest';
import {
	FULL_PAYMENT_DEPOSIT,
	depositRuleOf,
	discountAmount,
	isValidDepositRule,
	priceReservation,
	type DepositRule,
} from '../../../src/lib/utils/pricing';
import { resolveSeatingPrice } from '../../../src/lib/utils/seating-price';
import { formatCurrency } from '../../../src/lib/utils/currency';

const NONE: DepositRule = { type: 'none', value: 0 };

describe('priceReservation — Deposit rules', () => {
	it('takes the whole total online with a 100 % Deposit (full payment)', () => {
		expect(priceReservation({ unitPrice: 6500, seats: 2, deposit: FULL_PAYMENT_DEPOSIT })).toEqual({
			subtotal: 13000,
			discount: 0,
			total: 13000,
			deposit: 13000,
			balance: 0,
		});
	});

	it('takes nothing online with no Deposit: the whole total is the Balance', () => {
		expect(priceReservation({ unitPrice: 6500, seats: 2, deposit: NONE })).toEqual({
			subtotal: 13000,
			discount: 0,
			total: 13000,
			deposit: 0,
			balance: 13000,
		});
	});

	it('charges a fixed Deposit per seat', () => {
		expect(priceReservation({ unitPrice: 6500, seats: 3, deposit: { type: 'fixed', value: 2000 } })).toEqual({
			subtotal: 19500,
			discount: 0,
			total: 19500,
			deposit: 6000,
			balance: 13500,
		});
	});

	it('charges a percentage Deposit of the total', () => {
		expect(priceReservation({ unitPrice: 6500, seats: 2, deposit: { type: 'percent', value: 30 } })).toEqual({
			subtotal: 13000,
			discount: 0,
			total: 13000,
			deposit: 3900,
			balance: 9100,
		});
	});

	it('rounds a percentage Deposit to the cent, half-up', () => {
		// 50 % of 1,05 € = 0,525 € → 0,53 €
		expect(priceReservation({ unitPrice: 105, seats: 1, deposit: { type: 'percent', value: 50 } }))
			.toMatchObject({ deposit: 53, balance: 52 });
		// 33 % of 10,01 € = 3,3033 € → 3,30 €
		expect(priceReservation({ unitPrice: 1001, seats: 1, deposit: { type: 'percent', value: 33 } }))
			.toMatchObject({ deposit: 330, balance: 671 });
		// 30 % of 0,15 € = 0,045 € → 0,05 € (half-cent boundary rounds up)
		expect(priceReservation({ unitPrice: 15, seats: 1, deposit: { type: 'percent', value: 30 } }))
			.toMatchObject({ deposit: 5, balance: 10 });
		// 30 % of 0,13 € = 0,039 € → 0,04 €; 30 % of 0,11 € = 0,033 € → 0,03 €
		expect(priceReservation({ unitPrice: 13, seats: 1, deposit: { type: 'percent', value: 30 } }).deposit).toBe(4);
		expect(priceReservation({ unitPrice: 11, seats: 1, deposit: { type: 'percent', value: 30 } }).deposit).toBe(3);
	});

	it('caps a fixed Deposit above the price at the total', () => {
		expect(priceReservation({ unitPrice: 1500, seats: 2, deposit: { type: 'fixed', value: 2000 } })).toEqual({
			subtotal: 3000,
			discount: 0,
			total: 3000,
			deposit: 3000,
			balance: 0,
		});
	});

	it('prices a free Seating at zero whatever the rule', () => {
		for (const deposit of [NONE, FULL_PAYMENT_DEPOSIT, { type: 'fixed', value: 2000 } as DepositRule]) {
			expect(priceReservation({ unitPrice: 0, seats: 4, deposit })).toEqual({
				subtotal: 0,
				discount: 0,
				total: 0,
				deposit: 0,
				balance: 0,
			});
		}
	});

	it('always has Balance = total − Deposit', () => {
		for (const unitPrice of [0, 1, 99, 105, 1001, 6500]) {
			for (const seats of [1, 2, 3, 7]) {
				for (const deposit of [NONE, FULL_PAYMENT_DEPOSIT, { type: 'percent', value: 33 }, { type: 'fixed', value: 777 }] as DepositRule[]) {
					const price = priceReservation({ unitPrice, seats, deposit, discount: { discountType: 'percent', discountValue: 15 } });
					expect(price.deposit + price.balance).toBe(price.total);
					expect(price.deposit).toBeGreaterThanOrEqual(0);
					expect(price.balance).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});
});

describe('priceReservation — Promo Codes', () => {
	it('works out a percentage Deposit on the total after a percent Promo Code', () => {
		// 2 × 50 € = 100 €, −10 % = 90 €, Deposit 30 % = 27 €
		expect(priceReservation({
			unitPrice: 5000,
			seats: 2,
			discount: { discountType: 'percent', discountValue: 10 },
			deposit: { type: 'percent', value: 30 },
		})).toEqual({ subtotal: 10000, discount: 1000, total: 9000, deposit: 2700, balance: 6300 });
	});

	it('works out a percentage Deposit on the total after an amount Promo Code', () => {
		// 100 € − 25 € = 75 €, Deposit 50 % = 37,50 €
		expect(priceReservation({
			unitPrice: 5000,
			seats: 2,
			discount: { discountType: 'amount', discountValue: 2500 },
			deposit: { type: 'percent', value: 50 },
		})).toEqual({ subtotal: 10000, discount: 2500, total: 7500, deposit: 3750, balance: 3750 });
	});

	it('caps a fixed Deposit at the discounted total', () => {
		// 2 × 30 € = 60 €, −50 € = 10 €; fixed 20 € × 2 = 40 € capped at 10 €
		expect(priceReservation({
			unitPrice: 3000,
			seats: 2,
			discount: { discountType: 'amount', discountValue: 5000 },
			deposit: { type: 'fixed', value: 2000 },
		})).toEqual({ subtotal: 6000, discount: 5000, total: 1000, deposit: 1000, balance: 0 });
	});

	it('keeps a fixed Deposit fixed while it is below the discounted total', () => {
		// 2 × 50 € = 100 €, −20 € = 80 €; fixed 15 € × 2 = 30 €, untouched by the discount
		expect(priceReservation({
			unitPrice: 5000,
			seats: 2,
			discount: { discountType: 'amount', discountValue: 2000 },
			deposit: { type: 'fixed', value: 1500 },
		})).toEqual({ subtotal: 10000, discount: 2000, total: 8000, deposit: 3000, balance: 5000 });
	});

	it('caps a fixed Deposit at the total after a percent Promo Code', () => {
		// 2 × 30 € = 60 €, −50 % = 30 €; fixed 20 € × 2 = 40 € capped at 30 €
		expect(priceReservation({
			unitPrice: 3000,
			seats: 2,
			discount: { discountType: 'percent', discountValue: 50 },
			deposit: { type: 'fixed', value: 2000 },
		})).toEqual({ subtotal: 6000, discount: 3000, total: 3000, deposit: 3000, balance: 0 });
	});

	it('takes an amount Promo Code off the price, not off the Deposit', () => {
		// 100 € − 25 € = 75 €, Deposit 30 % = 22,50 € — not 30 € − 25 € = 5 €
		expect(priceReservation({
			unitPrice: 5000,
			seats: 2,
			discount: { discountType: 'amount', discountValue: 2500 },
			deposit: { type: 'percent', value: 30 },
		})).toEqual({ subtotal: 10000, discount: 2500, total: 7500, deposit: 2250, balance: 5250 });
	});

	it('a 100 % Promo Code leaves nothing to pay online or at the venue, whatever the rule', () => {
		for (const deposit of [NONE, FULL_PAYMENT_DEPOSIT, { type: 'percent', value: 30 }, { type: 'fixed', value: 2000 }] as DepositRule[]) {
			expect(priceReservation({
				unitPrice: 5000,
				seats: 2,
				discount: { discountType: 'percent', discountValue: 100 },
				deposit,
			})).toEqual({ subtotal: 10000, discount: 10000, total: 0, deposit: 0, balance: 0 });
		}
	});

	it('never discounts below zero', () => {
		expect(priceReservation({
			unitPrice: 2000,
			seats: 1,
			discount: { discountType: 'amount', discountValue: 9999 },
			deposit: FULL_PAYMENT_DEPOSIT,
		})).toEqual({ subtotal: 2000, discount: 2000, total: 0, deposit: 0, balance: 0 });
	});

	it('rounds a percent Promo Code to the cent, half-up', () => {
		expect(discountAmount({ discountType: 'percent', discountValue: 10 }, 333)).toBe(33);
		expect(discountAmount({ discountType: 'percent', discountValue: 10 }, 335)).toBe(34);
		expect(discountAmount({ discountType: 'percent', discountValue: 20 }, 5000)).toBe(1000);
	});
});

describe('Deposit rule', () => {
	it('accepts only the combinations the database accepts', () => {
		expect(isValidDepositRule({ type: 'none', value: 0 })).toBe(true);
		expect(isValidDepositRule({ type: 'none', value: 10 })).toBe(false);
		expect(isValidDepositRule({ type: 'fixed', value: 2000 })).toBe(true);
		expect(isValidDepositRule({ type: 'fixed', value: 0 })).toBe(false);
		expect(isValidDepositRule({ type: 'fixed', value: 12.5 })).toBe(false);
		expect(isValidDepositRule({ type: 'percent', value: 1 })).toBe(true);
		expect(isValidDepositRule({ type: 'percent', value: 100 })).toBe(true);
		expect(isValidDepositRule({ type: 'percent', value: 0 })).toBe(false);
		expect(isValidDepositRule({ type: 'percent', value: 101 })).toBe(false);
		expect(isValidDepositRule({ type: 'other' as never, value: 1 })).toBe(false);
	});

	it('reads an Event’s rule, defaulting to full payment online', () => {
		expect(depositRuleOf({ depositType: 'fixed', depositValue: 1500 })).toEqual({ type: 'fixed', value: 1500 });
		expect(depositRuleOf({})).toEqual(FULL_PAYMENT_DEPOSIT);
	});
});

describe('a non-EUR Event’s totals (issue 042)', () => {
	// A London dinner priced in pounds: the Seating's price, the fixed
	// Deposit and the fixed-amount Promo Code are all in the Event's
	// currency, and so are the totals the Guest is shown.
	const price = resolveSeatingPrice({
		servicePriceAmount: 8500,
		eventCurrency: 'GBP',
		legacyPriceAmount: null,
		legacyCurrency: null,
	})!;

	it('prices the Reservation in the Event’s currency', () => {
		const breakdown = priceReservation({
			unitPrice: price.amount,
			seats: 2,
			discount: { discountType: 'amount', discountValue: 1000 },
			deposit: { type: 'fixed', value: 2000 },
		});
		expect(price.currency).toBe('GBP');
		expect(breakdown).toEqual({ subtotal: 17000, discount: 1000, total: 16000, deposit: 4000, balance: 12000 });
		expect(formatCurrency(breakdown.total, price.currency)).toBe('£160.00');
		expect(formatCurrency(breakdown.deposit, price.currency)).toBe('£40.00');
		expect(formatCurrency(breakdown.balance, price.currency, 'fr-FR')).toBe('120,00 £GB');
	});

	it('shows a Swiss Event’s full payment in francs', () => {
		const chf = resolveSeatingPrice({ servicePriceAmount: 4200, eventCurrency: 'CHF', legacyPriceAmount: null, legacyCurrency: null })!;
		const breakdown = priceReservation({ unitPrice: chf.amount, seats: 3, deposit: FULL_PAYMENT_DEPOSIT });
		expect(breakdown).toMatchObject({ total: 12600, deposit: 12600, balance: 0 });
		expect(formatCurrency(breakdown.deposit, chf.currency)).toBe('CHF 126.00');
	});
});

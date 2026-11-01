import { describe, it, expect } from 'vitest';
import { quotePartySize } from '../../../../src/lib/utils/party-size';

// A standard party: 4 Guests at 25.00, Deposit 50.00 paid, Balance 50.00.
const base = {
	quantity: 4,
	total: 10000,
	depositPaid: 5000,
	balance: 5000,
	isComp: false,
	checkedIn: 0,
	status: 'confirmed',
};

describe('quotePartySize', () => {
	it('adds Guests: total and Balance grow, the Deposit is unchanged', () => {
		const r = quotePartySize(base, 6);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 6, total: 15000, balance: 10000, overPaid: 0, pricePerGuest: 2500 },
		});
	});

	it('removes Guests within the Balance: both shrink, never below 0', () => {
		const r = quotePartySize(base, 3);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 3, total: 7500, balance: 2500, overPaid: 0, pricePerGuest: 2500 },
		});
	});

	it('removal down to the Balance exactly lands at 0', () => {
		// Two Guests off eat the 50.00 Balance exactly.
		const r = quotePartySize(base, 2);
		expect(r.ok && r.quote.balance).toBe(0);
		expect(r.ok && r.quote.total).toBe(5000);
	});

	it('refuses a removal that would over-pay (refunded in issue 047, not here)', () => {
		// Down to 1 Guest: total 2500 < the 5000 Deposit paid.
		const r = quotePartySize(base, 1);
		expect(r.ok).toBe(false);
	});

	it('a Comp: only the quantity changes, every amount stays 0', () => {
		const r = quotePartySize(
			{ ...base, total: 0, depositPaid: 0, balance: 0, isComp: true },
			7
		);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 7, total: 0, balance: 0, overPaid: 0, pricePerGuest: 0 },
		});
	});

	it('a Promo Code discount carries over: the price per Guest is total ÷ quantity', () => {
		// 4 Guests, total 8000 after a discount: 20.00 per Guest.
		const r = quotePartySize({ ...base, total: 8000, balance: 0 }, 5);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 5, total: 10000, balance: 2000, overPaid: 0, pricePerGuest: 2000 },
		});
	});

	it('refuses below the Guests already checked in', () => {
		const r = quotePartySize({ ...base, checkedIn: 3 }, 2);
		expect(r.ok).toBe(false);
		expect(!r.ok && r.error).toContain('3');
	});

	it('refuses below 1', () => {
		expect(quotePartySize(base, 0).ok).toBe(false);
		expect(quotePartySize(base, -2).ok).toBe(false);
		expect(quotePartySize(base, 2.5).ok).toBe(false);
	});

	it('refuses a Reservation that is not confirmed', () => {
		const r = quotePartySize({ ...base, status: 'cancelled' }, 5);
		expect(r.ok).toBe(false);
	});

	it('the same quantity is a no-op quote', () => {
		const r = quotePartySize(base, 4);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 4, total: 10000, balance: 5000, overPaid: 0, pricePerGuest: 2500 },
		});
	});
});

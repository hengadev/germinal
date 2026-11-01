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
			quote: { quantity: 6, total: 15000, balance: 10000, overPaid: 0, pricePerGuest: 2500, overPaidRefund: null },
		});
	});

	it('removes Guests within the Balance: both shrink, never below 0', () => {
		const r = quotePartySize(base, 3);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 3, total: 7500, balance: 2500, overPaid: 0, pricePerGuest: 2500, overPaidRefund: null },
		});
	});

	it('removal down to the Balance exactly lands at 0', () => {
		// Two Guests off eat the 50.00 Balance exactly.
		const r = quotePartySize(base, 2);
		expect(r.ok && r.quote.balance).toBe(0);
		expect(r.ok && r.quote.total).toBe(5000);
	});

	it('a removal that over-pays is allowed, and says by how much', () => {
		// Down to 1 Guest: total 2500 < the 5000 Deposit paid → 2500 over-paid.
		const r = quotePartySize(base, 1);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 1, total: 2500, balance: 0, overPaid: 2500, pricePerGuest: 2500, overPaidRefund: null },
		});
	});

	it('a Comp: only the quantity changes, every amount stays 0', () => {
		const r = quotePartySize(
			{ ...base, total: 0, depositPaid: 0, balance: 0, isComp: true },
			7
		);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 7, total: 0, balance: 0, overPaid: 0, pricePerGuest: 0, overPaidRefund: null },
		});
	});

	it('a Promo Code discount carries over: the price per Guest is total ÷ quantity', () => {
		// 4 Guests, total 8000 after a discount: 20.00 per Guest.
		const r = quotePartySize({ ...base, total: 8000, balance: 0 }, 5);
		expect(r).toEqual({
			ok: true,
			quote: { quantity: 5, total: 10000, balance: 2000, overPaid: 0, pricePerGuest: 2000, overPaidRefund: null },
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
			quote: { quantity: 4, total: 10000, balance: 5000, overPaid: 0, pricePerGuest: 2500, overPaidRefund: null },
		});
	});
});

// Issue 047: the over-paid refund suggestion, one per Refund Policy kind.
const seatingStart = new Date('2030-05-01T19:00:00Z');
const now = new Date('2030-04-30T19:00:00Z'); // 24 h before the Seating
const withPolicy = (policy: object) => ({ ...base, refundPolicy: policy as never, seatingStart, now });

describe('quotePartySize over-paid refund', () => {
	it('a rule-based policy applies its tier to the over-paid amount', () => {
		// Full refund until 24 h before, 50 % until 12 h: exactly 24 h left → 100 %.
		const policy = { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 24, percent: 100 }, { hoursBefore: 12, percent: 50 }] };
		const r = quotePartySize(withPolicy(policy), 1);
		expect(r.ok && r.quote.overPaid).toBe(2500);
		expect(r.ok && r.quote.overPaidRefund?.amount).toBe(2500);
		expect(r.ok && r.quote.overPaidRefund?.reasonFr).toContain('Palier appliqué');
		expect(r.ok && r.quote.overPaidRefund?.reasonFr).toContain('24');
	});

	it('a rule-based policy can suggest less than the over-paid amount', () => {
		// 50 % until 12 h before, 25 h left → 50 % of the 2500 over-paid.
		const policy = { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 12, percent: 50 }] };
		const r = quotePartySize(withPolicy(policy), 1);
		expect(r.ok && r.quote.overPaidRefund?.amount).toBe(1250);
	});

	it('too late per the rules: 0 suggested', () => {
		const policy = { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 48, percent: 100 }] };
		const r = quotePartySize(withPolicy(policy), 1);
		expect(r.ok && r.quote.overPaidRefund).toEqual({
			amount: 0,
			reasonFr: expect.stringContaining('Trop tard'),
		});
	});

	it('a manual policy pre-fills the whole over-paid amount', () => {
		const policy = { type: 'manual', textEn: null, textFr: 'Sur décision', tiers: [] };
		const r = quotePartySize(withPolicy(policy), 1);
		expect(r.ok && r.quote.overPaidRefund).toEqual({
			amount: 2500,
			reasonFr: 'Politique manuelle : le montant du remboursement est à décider',
		});
	});

	it('amounts already refunded shrink the over-paid amount', () => {
		// 1000 of the Deposit already refunded: depositPaid 4000, so down to
		// 1 Guest (total 2500) only 1500 is over-paid.
		const policy = { type: 'manual', textEn: null, textFr: null, tiers: [] };
		const r = quotePartySize({ ...withPolicy(policy), depositPaid: 4000 }, 1);
		expect(r.ok && r.quote.overPaid).toBe(1500);
		expect(r.ok && r.quote.overPaidRefund?.amount).toBe(1500);
	});

	it('without a policy the change is still allowed, without a suggestion', () => {
		const r = quotePartySize(base, 1);
		expect(r.ok && r.quote.overPaidRefund).toBeNull();
	});
});

import { describe, it, expect } from 'vitest';
import { bookedUnitPriceAmount, resolveSeatingPrice } from '../../../src/lib/utils/seating-price';

describe('resolveSeatingPrice', () => {
	it('books a Seating at its Service price', () => {
		expect(resolveSeatingPrice({
			servicePriceAmount: 4500,
			serviceCurrency: 'EUR',
			legacyPriceAmount: null,
			legacyCurrency: null,
		})).toEqual({ amount: 4500, currency: 'EUR', legacy: false });
	});

	it('allows a zero price (free Service)', () => {
		expect(resolveSeatingPrice({
			servicePriceAmount: 0,
			serviceCurrency: 'EUR',
			legacyPriceAmount: null,
			legacyCurrency: null,
		})).toEqual({ amount: 0, currency: 'EUR', legacy: false });
	});

	it('keeps the legacy price a migrated Seating kept, over its Service price', () => {
		expect(resolveSeatingPrice({
			servicePriceAmount: 4500,
			serviceCurrency: 'EUR',
			legacyPriceAmount: 6000,
			legacyCurrency: 'USD',
		})).toEqual({ amount: 6000, currency: 'USD', legacy: true });
	});

	it('has no price while the Service price is not set', () => {
		expect(resolveSeatingPrice({
			servicePriceAmount: null,
			serviceCurrency: 'EUR',
			legacyPriceAmount: null,
			legacyCurrency: null,
		})).toBeNull();
	});
});

describe('bookedUnitPriceAmount', () => {
	it('is the price before discount, per seat', () => {
		expect(bookedUnitPriceAmount({ totalAmount: 4000, discountAmount: 1000, quantity: 2 })).toBe(2500);
	});

	it('is zero for a free or comp Reservation', () => {
		expect(bookedUnitPriceAmount({ totalAmount: 0, discountAmount: 0, quantity: 3 })).toBe(0);
	});

	it('treats a missing discount as none', () => {
		expect(bookedUnitPriceAmount({ totalAmount: 9000, discountAmount: null, quantity: 3 })).toBe(3000);
	});
});

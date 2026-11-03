import { describe, it, expect } from 'vitest';
import { splitDeposit, normaliseGiftCardCode } from '../../../src/lib/utils/gift-card';

describe('splitDeposit (issue 065)', () => {
	it('the card pays the whole Deposit when its balance covers it', () => {
		expect(splitDeposit(2500, 5000)).toEqual({ card: 2500, stripe: 0 });
	});

	it('the card pays its balance and Stripe the rest', () => {
		expect(splitDeposit(2500, 1000)).toEqual({ card: 1000, stripe: 1500 });
	});

	it('exactly equal amounts split with nothing for Stripe', () => {
		expect(splitDeposit(2500, 2500)).toEqual({ card: 2500, stripe: 0 });
	});

	it('a card without balance leaves everything to Stripe', () => {
		expect(splitDeposit(2500, 0)).toEqual({ card: 0, stripe: 2500 });
		expect(splitDeposit(2500, -5)).toEqual({ card: 0, stripe: 2500 });
	});

	it('no Deposit redeems nothing, whatever the balance', () => {
		expect(splitDeposit(0, 5000)).toEqual({ card: 0, stripe: 0 });
		expect(splitDeposit(-100, 5000)).toEqual({ card: 0, stripe: 0 });
	});
});

describe('normaliseGiftCardCode', () => {
	it('uppercases and strips spaces and dashes', () => {
		expect(normaliseGiftCardCode('germ 7zk9-m3xt')).toBe('GERM7ZK9M3XT');
	});
});

// @vitest-environment node
/**
 * Issue 063 — pure gift card helpers: the code alphabet has no ambiguous
 * glyph, normalisation strips case, spaces and dashes, and the balance
 * always equals the initial amount plus the ledger.
 */
import { describe, it, expect } from 'vitest';
import {
	generateGiftCardCode,
	normaliseGiftCardCode,
	formatGiftCardCode,
	maskGiftCardCode,
	computeGiftCardBalance
} from '../../../../src/lib/utils/gift-card';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const FORBIDDEN = ['0', 'O', '1', 'I'];

describe('generateGiftCardCode', () => {
	it('follows the GERM-XXXX-XXXX shape', () => {
		for (let i = 0; i < 50; i++) {
			const code = generateGiftCardCode();
			expect(code).toMatch(/^GERM-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
		}
	});

	it('uses only unambiguous characters', () => {
		for (let i = 0; i < 50; i++) {
			for (const c of generateGiftCardCode()) {
				if (c === '-') continue;
				expect(ALPHABET).toContain(c);
				expect(FORBIDDEN).not.toContain(c);
			}
		}
	});

	it('varies between calls', () => {
		expect(new Set(Array.from({ length: 20 }, () => generateGiftCardCode())).size).toBe(20);
	});
});

describe('normaliseGiftCardCode', () => {
	it('uppercases and strips spaces and dashes', () => {
		expect(normaliseGiftCardCode('germ 7zk9-m3xt')).toBe('GERM7ZK9M3XT');
		expect(normaliseGiftCardCode('GERM-7ZK9-M3XT')).toBe('GERM7ZK9M3XT');
		expect(normaliseGiftCardCode(' germ-7zk9 - m3xt ')).toBe('GERM7ZK9M3XT');
	});
});

describe('formatGiftCardCode', () => {
	it('shows the code in groups', () => {
		expect(formatGiftCardCode('GERM7ZK9M3XT')).toBe('GERM-7ZK9-M3XT');
		expect(formatGiftCardCode('germ 7zk9 m3xt')).toBe('GERM-7ZK9-M3XT');
	});
});

describe('maskGiftCardCode', () => {
	it('keeps only the last four characters', () => {
		expect(maskGiftCardCode('GERM-7ZK9-M3XT')).toBe('GERM…M3XT');
	});
});

describe('computeGiftCardBalance', () => {
	it('starts at the initial amount', () => {
		expect(computeGiftCardBalance(5000, [])).toBe(5000);
	});

	it('subtracts uses and adds credits', () => {
		expect(computeGiftCardBalance(5000, [-2000, -1000, 500])).toBe(2500);
	});

	it('can be fully used', () => {
		expect(computeGiftCardBalance(5000, [-5000])).toBe(0);
	});
});

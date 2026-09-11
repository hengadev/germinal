import { describe, it, expect } from 'vitest';
import {
	formatCurrency,
	formatCurrencyAmount,
	getCurrencySymbol,
	parseCurrency,
	isValidCurrency
} from '../../../src/lib/utils/currency';

describe('formatCurrency', () => {
	it('formats with English conventions by default', () => {
		expect(formatCurrency(2500, 'EUR')).toBe('€25.00');
	});

	it('formats with French conventions when given a French locale', () => {
		// French: comma decimal separator, symbol after the amount
		expect(formatCurrency(2500, 'EUR', 'fr')).toBe('25,00\u00A0€');
	});

	it('respects decimal separator convention per locale', () => {
		expect(formatCurrency(123455, 'EUR', 'en')).toMatch(/^€1,234\.55$/);
		expect(formatCurrency(123455, 'EUR', 'fr')).toMatch(/^1[\s\u00A0\u202F]234,55\u00A0€$/);
	});
});

describe('formatCurrencyAmount', () => {
	it('drops trailing zero decimals so whole amounts stay compact', () => {
		expect(formatCurrencyAmount(2500, 'en')).toBe('25');
		expect(formatCurrencyAmount(2500, 'fr')).toBe('25');
	});

	it('keeps significant decimals with the locale decimal separator', () => {
		expect(formatCurrencyAmount(2550, 'en')).toBe('25.5');
		expect(formatCurrencyAmount(2550, 'fr')).toBe('25,5');
	});

	it('groups thousands per locale convention', () => {
		expect(formatCurrencyAmount(123455, 'en')).toBe('1,234.55');
		// French grouping uses a (narrow) no-break space
		expect(formatCurrencyAmount(123455, 'fr')).toMatch(/^1[\s\u00A0\u202F]234,55$/);
	});
});

describe('getCurrencySymbol', () => {
	it('extracts the euro symbol in both locales', () => {
		expect(getCurrencySymbol('EUR', 'en')).toBe('€');
		expect(getCurrencySymbol('EUR', 'fr')).toBe('€');
	});

	it('extracts the dollar symbol per locale convention', () => {
		expect(getCurrencySymbol('USD', 'en')).toBe('$');
		// French disambiguates dollars: Intl renders USD as '$US' in fr
		expect(getCurrencySymbol('USD', 'fr')).toBe('$US');
	});

	it('falls back to the raw code for unknown currencies', () => {
		expect(getCurrencySymbol('XYZ', 'en')).toBe('XYZ');
	});
});

describe('parseCurrency', () => {
	it('parses a decimal string to cents', () => {
		expect(parseCurrency('25.00')).toBe(2500);
	});

	it('throws on invalid input', () => {
		expect(() => parseCurrency('abc')).toThrow('Invalid amount');
	});
});

describe('isValidCurrency', () => {
	it('accepts supported ISO 4217 codes case-insensitively', () => {
		expect(isValidCurrency('EUR')).toBe(true);
		expect(isValidCurrency('eur')).toBe(true);
		expect(isValidCurrency('XYZ')).toBe(false);
	});
});

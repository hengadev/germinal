import { describe, expect, it } from 'vitest';
import { siteLocale } from '../../../src/lib/i18n';

describe('siteLocale', () => {
	it('keeps only the language of a regional browser locale', () => {
		expect(siteLocale('fr-FR')).toBe('fr');
		expect(siteLocale('fr-CA')).toBe('fr');
		expect(siteLocale('en-US')).toBe('en');
		expect(siteLocale('EN-gb')).toBe('en');
	});

	it('falls back to French for any other or no language', () => {
		expect(siteLocale('de-DE')).toBe('fr');
		expect(siteLocale(null)).toBe('fr');
		expect(siteLocale(undefined)).toBe('fr');
	});
});

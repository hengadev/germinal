import { describe, it, expect } from 'vitest';
import { lacksAltText, mediaAlt, parseAltText, MAX_ALT_TEXT_LENGTH } from '../../../src/lib/utils/media-alt';

/**
 * Issue 043 — bilingual alt text on images: rendered in the visitor's
 * language, falling back to the other one, then to the page's name for it.
 */

describe('mediaAlt', () => {
	const both = { altEn: 'A laid table', altFr: 'Une table dressée' };

	it('renders the alt text in the visitor’s language', () => {
		expect(mediaAlt(both, 'en', 'Salon')).toBe('A laid table');
		expect(mediaAlt(both, 'fr', 'Salon')).toBe('Une table dressée');
	});

	it('falls back to the other language', () => {
		expect(mediaAlt({ altEn: 'A laid table', altFr: '  ' }, 'fr')).toBe('A laid table');
		expect(mediaAlt({ altEn: null, altFr: 'Une table dressée' }, 'en')).toBe('Une table dressée');
	});

	it('falls back to the name given, then to nothing', () => {
		expect(mediaAlt({ altEn: null, altFr: null }, 'en', 'A Night at the Salon')).toBe('A Night at the Salon');
		expect(mediaAlt(null, 'fr', 'Jeanne Dupont')).toBe('Jeanne Dupont');
		expect(mediaAlt(undefined, 'fr')).toBe('');
	});
});

describe('lacksAltText', () => {
	it('is true when either language is missing', () => {
		expect(lacksAltText({ altEn: 'x', altFr: 'y' })).toBe(false);
		expect(lacksAltText({ altEn: 'x', altFr: null })).toBe(true);
		expect(lacksAltText({ altEn: ' ', altFr: 'y' })).toBe(true);
		expect(lacksAltText({})).toBe(true);
	});
});

describe('parseAltText', () => {
	it('trims and reads a blank text as null', () => {
		expect(parseAltText({ altEn: '  A table ', altFr: '   ' })).toEqual({
			ok: true,
			value: { altEn: 'A table', altFr: null },
		});
	});

	it('leaves out a language it was not given', () => {
		expect(parseAltText({ altFr: 'Une table' })).toEqual({ ok: true, value: { altFr: 'Une table' } });
		expect(parseAltText({})).toEqual({ ok: true, value: {} });
	});

	it('refuses a text too long or not a string, in French', () => {
		const long = parseAltText({ altEn: 'a'.repeat(MAX_ALT_TEXT_LENGTH + 1) });
		expect(long.ok).toBe(false);
		if (!long.ok) expect(long.error).toContain('trop long');
		expect(parseAltText({ altFr: 42 }).ok).toBe(false);
	});
});

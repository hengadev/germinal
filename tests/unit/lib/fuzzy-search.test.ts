import { describe, expect, it } from 'vitest';
import { fuzzyFilter, normalizeSearch } from '$lib/utils/fuzzy-search';

const EVENTS = [
	{ title: 'Dîner du Chef', place: 'Paris' },
	{ title: 'Brunch végétal', place: 'Lyon' },
	{ title: 'Soirée Huîtres & Champagne', place: 'Cancale' },
];
const search = (query: string) => fuzzyFilter(EVENTS, query, (e) => [e.title, e.place]).map((e) => e.title);

describe('normalizeSearch', () => {
	it('drops accents, case and punctuation', () => {
		expect(normalizeSearch('  Soirée Huîtres & Champagne! ')).toBe('soiree huitres champagne');
	});
});

describe('fuzzyFilter', () => {
	it('keeps every item, in order, for a blank query', () => {
		expect(search('  ')).toEqual(['Dîner du Chef', 'Brunch végétal', 'Soirée Huîtres & Champagne']);
	});

	it('ignores accents and case', () => {
		expect(search('VEGETAL')).toEqual(['Brunch végétal']);
		expect(search('dîner')).toEqual(['Dîner du Chef']);
	});

	it('needs every word typed, in any order, across fields', () => {
		expect(search('paris chef')).toEqual(['Dîner du Chef']);
		expect(search('chef lyon')).toEqual([]);
	});

	it('forgives a typo and missing letters', () => {
		expect(search('champange')).toEqual(['Soirée Huîtres & Champagne']);
		expect(search('brnch')).toEqual(['Brunch végétal']);
	});

	it('does not match loosely on a word of one or two letters', () => {
		expect(search('zq')).toEqual([]);
	});

	it('puts the closest matches first, the list order otherwise', () => {
		const items = [{ title: 'Dîner au Château' }, { title: 'Chandeleur' }, { title: 'Ch. Margaux' }];
		const ranked = fuzzyFilter(items, 'chat', (i) => [i.title]).map((i) => i.title);
		expect(ranked).toEqual(['Dîner au Château', 'Chandeleur']);
		expect(fuzzyFilter(items, 'ch', (i) => [i.title]).map((i) => i.title)).toEqual(['Dîner au Château', 'Chandeleur', 'Ch. Margaux']);
	});
});

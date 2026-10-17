import { describe, it, expect } from 'vitest';
import { formatProjectDates } from '../../../src/lib/utils/project-dates';

/** Issue 045 — the dates line of a Portfolio project page. */
describe('formatProjectDates', () => {
	it('names a single Day', () => {
		expect(formatProjectDates(['2027-03-12'], 'fr')).toBe('12 mars 2027');
		expect(formatProjectDates(['2027-03-12'], 'en')).toBe('12 March 2027');
	});

	it('collapses consecutive Days into a range', () => {
		expect(formatProjectDates(['2027-03-14', '2027-03-12', '2027-03-13'], 'fr')).toBe('12–14 mars 2027');
	});

	it('lists Days that are not consecutive, month and year said once', () => {
		expect(formatProjectDates(['2027-03-12', '2027-03-19', '2027-03-26'], 'fr')).toBe('12, 19 et 26 mars 2027');
		expect(formatProjectDates(['2027-03-12', '2027-03-19', '2027-03-26'], 'en')).toBe('12, 19 and 26 March 2027');
	});

	it('spans months and years', () => {
		expect(formatProjectDates(['2027-03-30', '2027-03-31', '2027-04-01', '2027-04-02'], 'fr')).toBe('30 mars – 2 avril 2027');
		expect(formatProjectDates(['2026-12-31', '2027-01-01'], 'en')).toBe('31 December 2026 – 1 January 2027');
	});

	it('is empty without Days, and ignores duplicates and malformed entries', () => {
		expect(formatProjectDates([], 'fr')).toBe('');
		expect(formatProjectDates(['2027-03-12', '2027-03-12', 'nope'], 'en')).toBe('12 March 2027');
	});
});

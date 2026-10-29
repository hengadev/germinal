import { describe, it, expect } from 'vitest';
import { parseEventListSort, sortEventList } from '../../../src/lib/utils/event-list-sort';

const events = [
	{ id: 'a', titleFr: 'Banquet', startDate: '2027-03-01', createdAt: '2026-01-03', updatedAt: '2026-10-01' },
	{ id: 'b', titleFr: null, titleEn: null, startDate: null, createdAt: '2026-01-01', updatedAt: '2026-10-20' },
	{ id: 'c', titleFr: 'Dîner', startDate: '2027-05-01', createdAt: '2026-01-02', updatedAt: '2026-09-01' },
	{ id: 'd', titleFr: 'apéritif', startDate: '2026-12-01', createdAt: '2026-01-04', updatedAt: '2026-10-10' },
];
const ids = (list: { id: string }[]) => list.map((event) => event.id);

describe('parseEventListSort', () => {
	it('defaults to the last modified first', () => {
		expect(parseEventListSort(null)).toBe('modified');
		expect(parseEventListSort('nonsense')).toBe('modified');
		expect(parseEventListSort('title')).toBe('title');
	});
});

describe('sortEventList', () => {
	it('puts the last modified first', () => {
		expect(ids(sortEventList(events, 'modified'))).toEqual(['b', 'd', 'a', 'c']);
	});

	it('puts the latest Event date first, Drafts without a Day last', () => {
		expect(ids(sortEventList(events, 'date'))).toEqual(['c', 'a', 'd', 'b']);
	});

	it('puts the last created first', () => {
		expect(ids(sortEventList(events, 'created'))).toEqual(['d', 'a', 'c', 'b']);
	});

	it('orders titles alphabetically, ignoring case and accents', () => {
		// « Sans titre » sorts under S.
		expect(ids(sortEventList(events, 'title'))).toEqual(['d', 'a', 'c', 'b']);
	});

	it('leaves the list it was given alone', () => {
		const copy = [...events];
		sortEventList(events, 'title');
		expect(events).toEqual(copy);
	});
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { adoptSavedMenus, adoptSavedSeatings, followSavedServices, keepEdits } from '$lib/utils/editor-refresh';

describe('keepEdits', () => {
	it('a field left as it was sent takes the saved value (generated English)', () => {
		const sent = { titleEn: '', descriptionEn: '' };
		const saved = { titleEn: 'Garden dinner', descriptionEn: 'A dinner.' };
		expect(keepEdits(sent, { ...sent }, saved)).toEqual(saved);
	});

	it('a field changed since the save started keeps what the Admin typed', () => {
		const sent = { titleEn: '', descriptionEn: '' };
		const current = { titleEn: 'Dinner in the gar', descriptionEn: '' };
		const saved = { titleEn: 'Garden dinner', descriptionEn: 'A dinner.' };
		expect(keepEdits(sent, current, saved)).toEqual({ titleEn: 'Dinner in the gar', descriptionEn: 'A dinner.' });
	});

	it('a field typed back to what was sent counts as untouched', () => {
		const sent = { titleEn: 'Dinner' };
		expect(keepEdits(sent, { titleEn: 'Dinner' }, { titleEn: 'Dinner' })).toEqual({ titleEn: 'Dinner' });
	});

	it('leaves its arguments alone', () => {
		const sent = { titleEn: '' };
		const current = { titleEn: '' };
		keepEdits(sent, current, { titleEn: 'Dinner' });
		expect(current).toEqual({ titleEn: '' });
	});
});

function seating(key: number, id: string | null, titleEn = '') {
	return { key, id, titleEn, descriptionEn: '', reservationCount: 0, soldSeats: 0, start: '12:00' };
}

describe('adoptSavedSeatings', () => {
	const placeholderOf = (date: string, kind: string) => `ph-${date}-${kind}`;

	it('a meal and Seatings just saved take their ids, keeping what was typed since', () => {
		const sent = [{ serviceId: 'ph-1', date: '2026-11-02', kind: 'lunch', seatings: [seating(1, null), seating(2, 's-old')] }];
		const drafts = structuredClone(sent);
		drafts[0].seatings[0].start = '12:30';
		drafts[0].seatings[1].titleEn = 'Chef’s tab';
		drafts[0].seatings.push(seating(3, null));
		const saved = [{
			serviceId: 'svc-1', date: '2026-11-02', kind: 'lunch',
			seatings: [{ ...seating(90, 's-new', 'Lunch'), soldSeats: 0 }, { ...seating(91, 's-old', 'Lunch'), soldSeats: 4, reservationCount: 2 }],
		}];

		adoptSavedSeatings(drafts, sent, saved, { 'svc-1': ['s-new', 's-old'] }, placeholderOf);

		expect(drafts[0].serviceId).toBe('svc-1');
		expect(drafts[0].seatings.map((s) => [s.key, s.id])).toEqual([[1, 's-new'], [2, 's-old'], [3, null]]);
		// Typed since: kept. Not typed since: the generated English.
		expect(drafts[0].seatings[0]).toMatchObject({ start: '12:30', titleEn: 'Lunch' });
		expect(drafts[0].seatings[1]).toMatchObject({ titleEn: 'Chef’s tab', soldSeats: 4, reservationCount: 2 });
	});

	it('a meal picked since the save started stays new; one removed by the save becomes new again', () => {
		const sent = [{ serviceId: 'svc-1', date: '2026-11-02', kind: 'lunch', seatings: [seating(1, 's-1')] }];
		const drafts = [
			{ serviceId: 'svc-gone', date: '2026-11-01', kind: 'dinner', seatings: [seating(5, 's-gone')] },
			{ serviceId: 'ph-2026-11-03-dinner', date: '2026-11-03', kind: 'dinner', seatings: [seating(6, null)] },
		];
		adoptSavedSeatings(drafts, sent, [{ serviceId: 'svc-1', date: '2026-11-02', kind: 'lunch', seatings: [seating(9, 's-1')] }], {}, placeholderOf);
		expect(drafts.map((d) => d.serviceId)).toEqual(['ph-2026-11-01-dinner', 'ph-2026-11-03-dinner']);
		expect(drafts[0].seatings[0].id).toBeNull();
	});

	it('without ids from the server, Seatings already saved keep theirs and new ones stay new', () => {
		const sent = [{ serviceId: 'svc-1', date: '2026-11-02', kind: 'lunch', seatings: [seating(1, 's-1'), seating(2, null)] }];
		const drafts = structuredClone(sent);
		adoptSavedSeatings(drafts, sent, [{ serviceId: 'svc-1', date: '2026-11-02', kind: 'lunch', seatings: [seating(9, 's-1')] }], undefined, placeholderOf);
		expect(drafts[0].seatings.map((s) => s.id)).toEqual(['s-1', null]);
	});
});

describe('adoptSavedMenus', () => {
	const menu = (key: string, id: string | null, nameEn = '') => ({ key, id, nameFr: 'Menu', nameEn, descriptionEn: '' });

	it('a Menu just created takes its id and its generated English, unless edited since', () => {
		const sent = [menu('new-1', null), menu('new-2', null)];
		const menus = structuredClone(sent);
		menus[1].nameEn = 'Tasting';
		menus.push(menu('new-3', null));
		const saved = [menu('m-1', 'm-1', 'Menu'), menu('m-2', 'm-2', 'Menu')];
		adoptSavedMenus(menus, sent, saved, { 'new-1': 'm-1', 'new-2': 'm-2' });
		expect(menus.map((m) => [m.key, m.id, m.nameEn])).toEqual([['new-1', 'm-1', 'Menu'], ['new-2', 'm-2', 'Tasting'], ['new-3', null, '']]);
	});
});

describe('followSavedServices', () => {
	const service = (serviceId: string, seatingCount = 0) => ({ serviceId, seatingCount, legacySeatings: [] as unknown[], price: null as number | null });

	it('keeps the same list when the same Services are saved, updating their counts', () => {
		const current = [{ ...service('a'), price: 45 }];
		expect(followSavedServices(current, [service('a', 2)])).toBeNull();
		expect(current[0]).toMatchObject({ price: 45, seatingCount: 2 });
	});

	it('adds the Services just saved and drops the removed ones, keeping prices typed', () => {
		const current = [{ ...service('a'), price: 45 }, service('b')];
		const next = followSavedServices(current, [service('a'), service('c')]);
		expect(next?.map((s) => [s.serviceId, s.price])).toEqual([['a', 45], ['c', null]]);
	});
});

import { describe, it, expect } from 'vitest';
import {
	parseServiceRefs,
	refersOnlyTo,
	resolveServiceRefs,
	serviceKey,
} from '../../../src/lib/server/services/new-event-schedule';

const LUNCH_REF = '11111111-1111-4111-8111-111111111111';
const DINNER_REF = '22222222-2222-4222-8222-222222222222';
const DAYS = [{ date: '2026-11-14', kinds: ['lunch' as const, 'dinner' as const] }];

describe('parseServiceRefs', () => {
	it('reads one placeholder per picked Day and meal', () => {
		const raw = JSON.stringify([
			{ ref: LUNCH_REF, date: '2026-11-14', kind: 'lunch' },
			{ ref: DINNER_REF, date: '2026-11-14', kind: 'dinner' },
		]);
		expect(parseServiceRefs(raw, DAYS)).toEqual([
			{ ref: LUNCH_REF, date: '2026-11-14', kind: 'lunch' },
			{ ref: DINNER_REF, date: '2026-11-14', kind: 'dinner' },
		]);
	});

	it('treats a missing field as no placeholder', () => {
		expect(parseServiceRefs(null, DAYS)).toEqual([]);
		expect(parseServiceRefs('', DAYS)).toEqual([]);
	});

	it('refuses a meal that was not picked', () => {
		const raw = JSON.stringify([{ ref: LUNCH_REF, date: '2026-11-15', kind: 'lunch' }]);
		expect(parseServiceRefs(raw, DAYS)).toBeNull();
	});

	it('refuses two placeholders for the same meal, or the same placeholder twice', () => {
		expect(parseServiceRefs(JSON.stringify([
			{ ref: LUNCH_REF, date: '2026-11-14', kind: 'lunch' },
			{ ref: DINNER_REF, date: '2026-11-14', kind: 'lunch' },
		]), DAYS)).toBeNull();
		expect(parseServiceRefs(JSON.stringify([
			{ ref: LUNCH_REF, date: '2026-11-14', kind: 'lunch' },
			{ ref: LUNCH_REF, date: '2026-11-14', kind: 'dinner' },
		]), DAYS)).toBeNull();
	});

	it('refuses malformed input', () => {
		expect(parseServiceRefs('not json', DAYS)).toBeNull();
		expect(parseServiceRefs('{}', DAYS)).toBeNull();
		expect(parseServiceRefs(JSON.stringify([{ ref: 'abc', date: '2026-11-14', kind: 'lunch' }]), DAYS)).toBeNull();
		expect(parseServiceRefs(JSON.stringify([{ ref: LUNCH_REF, date: '2026-11-14', kind: 'brunch' }]), DAYS)).toBeNull();
	});
});

describe('refersOnlyTo', () => {
	const refs = [{ ref: LUNCH_REF, date: '2026-11-14', kind: 'lunch' as const }];

	it('accepts payloads naming known placeholders only', () => {
		expect(refersOnlyTo([{ serviceId: LUNCH_REF }], refs)).toBe(true);
		expect(refersOnlyTo([], refs)).toBe(true);
	});

	it('rejects an unknown placeholder', () => {
		expect(refersOnlyTo([{ serviceId: DINNER_REF }], refs)).toBe(false);
	});
});

describe('resolveServiceRefs', () => {
	const refs = [
		{ ref: LUNCH_REF, date: '2026-11-14', kind: 'lunch' as const },
		{ ref: DINNER_REF, date: '2026-11-14', kind: 'dinner' as const },
	];
	const realIds = new Map([
		[serviceKey('2026-11-14', 'lunch'), 'real-lunch'],
		[serviceKey('2026-11-14', 'dinner'), 'real-dinner'],
	]);

	it('swaps placeholders for the created Services, keeping the rest', () => {
		expect(resolveServiceRefs([{ serviceId: DINNER_REF, price: 50 }], refs, realIds)).toEqual([
			{ serviceId: 'real-dinner', price: 50 },
		]);
	});

	it('throws when a placeholder has no created Service', () => {
		expect(() => resolveServiceRefs([{ serviceId: LUNCH_REF }], refs, new Map())).toThrow();
	});
});

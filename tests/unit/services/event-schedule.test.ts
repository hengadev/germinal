import { describe, it, expect } from 'vitest';
import {
	LUNCH_DINNER_CUTOFF_HOUR,
	classifyServiceKind,
	utcDayKey,
	seatingDurationMinutes,
	dayStartUtc,
	dayEndUtc,
	groupScheduleByDayAndService,
	parsePickedDays,
	planScheduleChange,
	type CurrentScheduleNode,
} from '../../../src/lib/server/services/event-schedule';

describe('classifyServiceKind', () => {
	it('classifies a start before the cut-off as lunch', () => {
		expect(classifyServiceKind(new Date('2026-07-15T12:00:00Z'))).toBe('lunch');
		expect(classifyServiceKind(new Date('2026-07-15T15:59:59Z'))).toBe('lunch');
		expect(classifyServiceKind(new Date('2026-01-01T00:00:00Z'))).toBe('lunch');
	});

	it('classifies a start at or after the cut-off as dinner', () => {
		// Exactly 16:00 is dinner — the cut-off is exclusive for lunch
		expect(classifyServiceKind(new Date(`2026-07-15T${LUNCH_DINNER_CUTOFF_HOUR}:00:00Z`))).toBe('dinner');
		expect(classifyServiceKind(new Date('2026-07-15T16:00:01Z'))).toBe('dinner');
		expect(classifyServiceKind(new Date('2026-07-15T23:59:59Z'))).toBe('dinner');
	});
});

describe('utcDayKey', () => {
	it('returns the UTC calendar date of a Seating', () => {
		expect(utcDayKey(new Date('2026-07-15T18:30:00Z'))).toBe('2026-07-15');
		expect(utcDayKey(new Date('2026-07-15T23:30:00Z'))).toBe('2026-07-15');
		expect(utcDayKey(new Date('2026-07-16T00:30:00Z'))).toBe('2026-07-16');
	});
});

describe('seatingDurationMinutes', () => {
	it('returns whole minutes between start and end', () => {
		expect(seatingDurationMinutes(
			new Date('2026-07-15T12:00:00Z'),
			new Date('2026-07-15T13:30:00Z')
		)).toBe(90);
	});

	it('rounds partial minutes up and never returns zero', () => {
		expect(seatingDurationMinutes(
			new Date('2026-07-15T12:00:00Z'),
			new Date('2026-07-15T12:00:30Z')
		)).toBe(1);
		expect(seatingDurationMinutes(
			new Date('2026-07-15T12:00:00Z'),
			new Date('2026-07-15T12:00:00Z')
		)).toBe(1);
	});
});

describe('dayStartUtc / dayEndUtc', () => {
	it('dayStartUtc is midnight UTC of the day', () => {
		expect(dayStartUtc('2026-07-15').toISOString()).toBe('2026-07-15T00:00:00.000Z');
	});

	it('dayEndUtc is the last representable instant of the day', () => {
		expect(dayEndUtc('2026-07-15').toISOString()).toBe('2026-07-15T23:59:59.999Z');
	});
});

describe('parsePickedDays', () => {
	it('parses and sorts a valid payload, normalising kind order and duplicates', () => {
		const result = parsePickedDays(
			JSON.stringify([
				{ date: '2026-07-16', kinds: ['dinner', 'lunch', 'dinner'] },
				{ date: '2026-07-14', kinds: ['dinner'] },
			])
		);

		expect(result).toEqual({
			ok: true,
			days: [
				{ date: '2026-07-14', kinds: ['dinner'] },
			{ date: '2026-07-16', kinds: ['lunch', 'dinner'] },
			],
		});
	});

	it('rejects a missing or empty payload', () => {
		expect(parsePickedDays(null)).toEqual({ ok: false, reason: 'missing' });
		expect(parsePickedDays('')).toEqual({ ok: false, reason: 'missing' });
		expect(parsePickedDays('   ')).toEqual({ ok: false, reason: 'missing' });
	});

	it('rejects a malformed payload', () => {
		expect(parsePickedDays('not json')).toEqual({ ok: false, reason: 'malformed' });
		expect(parsePickedDays('"a string"')).toEqual({ ok: false, reason: 'malformed' });
		expect(parsePickedDays(JSON.stringify([{ date: '2026-07-14', kinds: 'dinner' }])))
			.toEqual({ ok: false, reason: 'malformed' });
		expect(parsePickedDays(JSON.stringify([{ date: '2026-07-14', kinds: ['brunch'] }])))
			.toEqual({ ok: false, reason: 'malformed' });
	});

	it('rejects an invalid or impossible calendar date', () => {
		expect(parsePickedDays(JSON.stringify([{ date: '14-07-2026', kinds: ['dinner'] }])))
			.toEqual({ ok: false, reason: 'invalid-date' });
		expect(parsePickedDays(JSON.stringify([{ date: '2026-02-30', kinds: ['dinner'] }])))
			.toEqual({ ok: false, reason: 'invalid-date' });
		expect(parsePickedDays(JSON.stringify([{ date: '2026-13-01', kinds: ['dinner'] }])))
			.toEqual({ ok: false, reason: 'invalid-date' });
	});

	it('rejects a duplicated day', () => {
		expect(parsePickedDays(JSON.stringify([
			{ date: '2026-07-14', kinds: ['lunch'] },
			{ date: '2026-07-14', kinds: ['dinner'] },
		])))
			.toEqual({ ok: false, reason: 'duplicate-day' });
	});

	it('rejects an empty selection and a day without any meal', () => {
		expect(parsePickedDays('[]')).toEqual({ ok: false, reason: 'empty' });
		expect(parsePickedDays(JSON.stringify([{ date: '2026-07-14', kinds: [] }])))
			.toEqual({ ok: false, reason: 'day-without-service' });
	});
});

describe('planScheduleChange', () => {
	function node(date: string, kinds: ('lunch' | 'dinner')[]): CurrentScheduleNode {
		return {
			dayId: `day-${date}`,
			date,
			services: kinds.map((kind) => ({ serviceId: `${date}-${kind}`, kind })),
		};
	}

	it('is a no-op when the picked set matches the current schedule', () => {
		const current = [node('2026-07-13', ['lunch', 'dinner']), node('2026-07-15', ['dinner'])];

		expect(planScheduleChange(current, [
			{ date: '2026-07-15', kinds: ['dinner'] },
			{ date: '2026-07-13', kinds: ['dinner', 'lunch'] },
		])).toEqual({
			daysToAdd: [],
			servicesToAdd: [],
			serviceIdsToRemove: [],
			dayIdsToRemove: [],
		});
	});

	it('plans new non-consecutive Days and their Services', () => {
		const plan = planScheduleChange([], [
			{ date: '2026-07-15', kinds: ['dinner'] },
			{ date: '2026-07-13', kinds: ['lunch', 'dinner'] },
		]);

		expect(plan.daysToAdd).toEqual(['2026-07-13', '2026-07-15']);
		expect(plan.servicesToAdd).toEqual([
			{ date: '2026-07-13', kind: 'lunch' },
			{ date: '2026-07-13', kind: 'dinner' },
			{ date: '2026-07-15', kind: 'dinner' },
		]);
	});

	it('plans the removal of an un-picked Day and of an un-ticked meal on a kept Day', () => {
		const current = [
			node('2026-07-13', ['lunch', 'dinner']),
			node('2026-07-15', ['dinner']),
		];

		const plan = planScheduleChange(current, [
			{ date: '2026-07-13', kinds: ['dinner'] },
		]);

		expect(plan.serviceIdsToRemove).toEqual(['2026-07-13-lunch', '2026-07-15-dinner']);
		expect(plan.dayIdsToRemove).toEqual(['day-2026-07-15']);
		expect(plan.daysToAdd).toEqual([]);
		expect(plan.servicesToAdd).toEqual([]);
	});

	it('adds a meal to an existing Day without touching its other Services', () => {
		const current = [node('2026-07-13', ['dinner'])];

		const plan = planScheduleChange(current, [
			{ date: '2026-07-13', kinds: ['lunch', 'dinner'] },
		]);

		expect(plan).toEqual({
			daysToAdd: [],
			servicesToAdd: [{ date: '2026-07-13', kind: 'lunch' }],
			serviceIdsToRemove: [],
			dayIdsToRemove: [],
		});
	});

	it('re-adds a Day that was previously removed', () => {
		const current = [node('2026-07-13', ['dinner'])];

		const plan = planScheduleChange(current, [
			{ date: '2026-07-14', kinds: ['lunch'] },
		]);

		expect(plan.daysToAdd).toEqual(['2026-07-14']);
		expect(plan.servicesToAdd).toEqual([{ date: '2026-07-14', kind: 'lunch' }]);
		expect(plan.serviceIdsToRemove).toEqual(['2026-07-13-dinner']);
		expect(plan.dayIdsToRemove).toEqual(['day-2026-07-13']);
	});
});

describe('groupScheduleByDayAndService', () => {
	function row(dayDate: string, serviceKind: 'lunch' | 'dinner', id: string) {
		return { dayDate, serviceKind, item: { id } };
	}

	it('groups rows into days ordered by date, lunch before dinner', () => {
		const grouped = groupScheduleByDayAndService([
			row('2026-07-16', 'dinner', 's3'),
			row('2026-07-15', 'dinner', 's2'),
			row('2026-07-15', 'lunch', 's1'),
			row('2026-07-16', 'lunch', 's4'),
		]);

		expect(grouped.map((d) => d.date)).toEqual(['2026-07-15', '2026-07-16']);
		expect(grouped[0].services.map((s) => s.kind)).toEqual(['lunch', 'dinner']);
		expect(grouped[0].services[0].items.map((i) => i.id)).toEqual(['s1']);
		expect(grouped[0].services[1].items.map((i) => i.id)).toEqual(['s2']);
		expect(grouped[1].services.map((s) => s.kind)).toEqual(['lunch', 'dinner']);
	});

	it('keeps Seatings of one Service in the order given (start time)', () => {
		const grouped = groupScheduleByDayAndService([
			row('2026-07-15', 'lunch', 'first'),
			row('2026-07-15', 'lunch', 'second'),
		]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0].services).toHaveLength(1);
		expect(grouped[0].services[0].items.map((i) => i.id)).toEqual(['first', 'second']);
	});

	it('returns an empty grouping for no rows', () => {
		expect(groupScheduleByDayAndService([])).toEqual([]);
	});
});

import { describe, it, expect } from 'vitest';
import {
	LUNCH_DINNER_CUTOFF_HOUR,
	classifyServiceKind,
	utcDayKey,
	seatingDurationMinutes,
	dayStartUtc,
	dayEndUtc,
	groupScheduleByDayAndService,
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

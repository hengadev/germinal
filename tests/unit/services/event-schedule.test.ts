import { describe, it, expect } from 'vitest';
import {
	seatingDurationMinutes,
	groupScheduleByDayAndService,
	parsePickedDays,
	planScheduleChange,
	type CurrentScheduleNode,
} from '../../../src/lib/server/services/event-schedule';

// Day, meal and Day bounds in the Event's Time Zone: tests/unit/lib/event-time.test.ts

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

// ---------------------------------------------------------------------------
// Seatings per Service (issue 020): payload parsing with end-time filling,
// overlap detection, and derived titles for untitled Seatings.
// ---------------------------------------------------------------------------

import {
	parseSeatingsPayload,
	findPlannedSeatingOverlaps,
	formatSeatingOverlapWarning,
	derivedSeatingTitle,
	seatingTitlesWithFallback,
	type ParsedServiceSeatings,
} from '../../../src/lib/server/services/event-schedule';
import {
	parseTimeOfDay,
	formatTimeOfDay,
	endAfterDuration,
	findSeatingOverlaps,
} from '../../../src/lib/utils/seating-times';

const SERVICE_ID = '11111111-2222-3333-4444-555555555555';

function seatingPayload(overrides: Record<string, unknown> = {}) {
	return {
		id: null,
		start: '12:00',
		end: null,
		titleEn: '',
		titleFr: '',
		descriptionEn: null,
		descriptionFr: null,
		capacityOverride: null,
		published: false,
		allowWaitlist: false,
		badgeType: 'none',
		...overrides,
	};
}

function servicesPayload(
	services: { serviceId?: string; defaultDurationMinutes?: number; seatings: Record<string, unknown>[] }[]
) {
	return JSON.stringify(services.map((service) => ({
		serviceId: service.serviceId ?? SERVICE_ID,
		defaultDurationMinutes: service.defaultDurationMinutes ?? 90,
		seatings: service.seatings,
	})));
}

describe('parseTimeOfDay / formatTimeOfDay / endAfterDuration', () => {
	it('parses HH:MM into minutes since midnight, rejecting anything else', () => {
		expect(parseTimeOfDay('12:00')).toBe(720);
		expect(parseTimeOfDay('9:05')).toBe(545);
		expect(parseTimeOfDay('23:59')).toBe(1439);
		expect(parseTimeOfDay('24:00')).toBeNull();
		expect(parseTimeOfDay('12:60')).toBeNull();
		expect(parseTimeOfDay('12h00')).toBeNull();
		expect(parseTimeOfDay('')).toBeNull();
	});

	it('formats minutes as HH:MM', () => {
		expect(formatTimeOfDay(0)).toBe('00:00');
		expect(formatTimeOfDay(545)).toBe('09:05');
		expect(formatTimeOfDay(1439)).toBe('23:59');
	});

	it('derives an end that stays on the same Day, null at or past midnight', () => {
		expect(endAfterDuration(720, 90)).toBe(810);
		expect(endAfterDuration(22 * 60, 120)).toBeNull(); // would reach 24:00
		expect(endAfterDuration(23 * 60, 30)).toBe(1410);
	});
});

describe('parseSeatingsPayload', () => {
	it('fills a missing end from the Service default duration', () => {
		const result = parseSeatingsPayload(servicesPayload([{
			defaultDurationMinutes: 105,
			seatings: [seatingPayload({ start: '12:00', end: null })],
		}]));

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		const seating = result.services[0].seatings[0];
		expect(seating.startMinutes).toBe(720);
		expect(seating.endMinutes).toBe(720 + 105);
	});

	it('keeps an explicit end that is after the start', () => {
		const result = parseSeatingsPayload(servicesPayload([{
			defaultDurationMinutes: 90,
			seatings: [seatingPayload({ start: '12:00', end: '15:00' })],
		}]));

		if (!result.ok) throw new Error('expected ok');
		expect(result.services[0].seatings[0].endMinutes).toBe(900);
	});

	it('rejects a missing payload, malformed JSON and a non-array', () => {
		expect(parseSeatingsPayload(null)).toEqual({ ok: false, reason: 'missing' });
		expect(parseSeatingsPayload('  ')).toEqual({ ok: false, reason: 'missing' });
		expect(parseSeatingsPayload('nope')).toEqual({ ok: false, reason: 'malformed' });
		expect(parseSeatingsPayload('{}')).toEqual({ ok: false, reason: 'malformed' });
	});

	it('rejects an unknown or duplicated service id', () => {
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [] }]).replace(SERVICE_ID, 'not-a-uuid')))
			.toEqual({ ok: false, reason: 'service' });
		expect(parseSeatingsPayload(servicesPayload([
			{ seatings: [] },
			{ seatings: [] },
		]))).toEqual({ ok: false, reason: 'service' });
	});

	it('rejects a default duration outside 1..1440 minutes', () => {
		expect(parseSeatingsPayload(servicesPayload([{ defaultDurationMinutes: 0, seatings: [] }])))
			.toEqual({ ok: false, reason: 'duration' });
		expect(parseSeatingsPayload(servicesPayload([{ defaultDurationMinutes: 1441, seatings: [] }])))
			.toEqual({ ok: false, reason: 'duration' });
		expect(parseSeatingsPayload(servicesPayload([{ defaultDurationMinutes: 75.5, seatings: [] }])))
			.toEqual({ ok: false, reason: 'duration' });
	});

	it('rejects invalid times, an end before or at the start, and midnight crossings', () => {
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ start: '12h00' })] }])))
			.toEqual({ ok: false, reason: 'time' });
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ start: '14:00', end: '13:00' })] }])))
			.toEqual({ ok: false, reason: 'time' });
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ start: '14:00', end: '14:00' })] }])))
			.toEqual({ ok: false, reason: 'time' });
		// 23:00 + the default 90 minutes would cross midnight
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ start: '23:00' })] }])))
			.toEqual({ ok: false, reason: 'time' });
	});

	it('rejects invalid seating fields and normalises titles', () => {
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ capacityOverride: 0 })] }])))
			.toEqual({ ok: false, reason: 'seating' });
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ badgeType: 'deluxe' })] }])))
			.toEqual({ ok: false, reason: 'seating' });
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ id: 'nope' })] }])))
			.toEqual({ ok: false, reason: 'seating' });

		const result = parseSeatingsPayload(servicesPayload([{
			seatings: [seatingPayload({ titleEn: '  ', titleFr: null })],
		}]));
		if (!result.ok) throw new Error('expected ok');
		expect(result.services[0].seatings[0].seating.titleEn).toBeNull();
		expect(result.services[0].seatings[0].seating.titleFr).toBeNull();
	});

	it('carries no per-Seating price: Seatings are priced from their Service (issue 022)', () => {
		const result = parseSeatingsPayload(servicesPayload([{
			seatings: [seatingPayload({ priceAmount: -1, currency: 'EUROS' })],
		}]));
		if (!result.ok) throw new Error('expected ok');
		expect(result.services[0].seatings[0].seating).not.toHaveProperty('priceAmount');
		expect(result.services[0].seatings[0].seating).not.toHaveProperty('currency');
	});
});

describe('overlap detection', () => {
	it('flags a Seating starting before the previous one ends', () => {
		const hits = findSeatingOverlaps([
			{ startMinutes: 720, endMinutes: 810 }, // 12:00–13:30
			{ startMinutes: 750, endMinutes: 870 }, // 12:30–14:30 starts before 13:30
		]);
		expect(hits).toEqual([{ index: 1, previousEndMinutes: 810 }]);
	});

	it('does not flag a perfect turn-over (start equal to previous end)', () => {
		expect(findSeatingOverlaps([
			{ startMinutes: 720, endMinutes: 810 },
			{ startMinutes: 810, endMinutes: 900 },
		])).toEqual([]);
	});

	it('flags later Seatings colliding with a longer earlier one, in input order', () => {
		const hits = findSeatingOverlaps([
			{ startMinutes: 840, endMinutes: 930 }, // 14:00–15:30
			{ startMinutes: 720, endMinutes: 900 }, // 12:00–15:00
			{ startMinutes: 930, endMinutes: 990 }, // 15:30–16:30 starts exactly at 15:30 → fine
		]);
		expect(hits).toEqual([{ index: 0, previousEndMinutes: 900 }]);
	});

	it('reports overlaps per Service from a parsed payload, without refusing it', () => {
		const parsed = parseSeatingsPayload(servicesPayload([{
			seatings: [
				seatingPayload({ start: '12:00' }),       // 12:00–13:30 (90')
				seatingPayload({ start: '13:00' }),       // 13:00–14:30 overlaps
				seatingPayload({ start: '19:00', end: '22:00' }),
			],
		}]));
		if (!parsed.ok) throw new Error('expected ok');

		const warnings = findPlannedSeatingOverlaps(parsed.services);
		expect(warnings).toEqual([
			{ serviceIndex: 0, seatingIndex: 1, start: '13:00', previousEnd: '13:30' },
		]);
		expect(formatSeatingOverlapWarning(warnings)).toBe(
			'Chevauchement de séances dans un même repas : la séance de 13h00 commence avant la fin de la précédente (13h30).'
		);
	});
});

describe('derived seating titles', () => {
	it('derives a label from Day, Service and time in both locales', () => {
		expect(derivedSeatingTitle(new Date('2026-07-15T10:00:00Z'), { timeZone: 'Europe/Paris', dayDate: '2026-07-15', serviceKind: 'lunch' }, 'fr'))
			.toBe('Déjeuner — mercredi 15 juillet 2026, 12h00');
		expect(derivedSeatingTitle(new Date('2026-07-15T17:30:00Z'), { timeZone: 'Europe/Paris', dayDate: '2026-07-15', serviceKind: 'dinner' }, 'en'))
			.toBe('Dinner — Wednesday, 15 July 2026, 19:30');
	});

	it('falls back to the start time alone to derive Day and Service', () => {
		expect(derivedSeatingTitle('2026-07-15T17:30:00Z', { timeZone: 'Europe/Paris' }, 'fr'))
			.toBe('Dîner — mercredi 15 juillet 2026, 19h30');
		expect(derivedSeatingTitle('2026-07-15T08:00:00Z', { timeZone: 'Europe/London' }, 'en'))
			.toBe('Lunch — Wednesday, 15 July 2026, 09:00');
	});

	it('keeps stored titles and only fills the empty side', () => {
		expect(seatingTitlesWithFallback({
			titleEn: 'Chef’s table',
			titleFr: null,
			startTime: new Date('2026-07-15T17:00:00Z'),
		}, { timeZone: 'Europe/Paris', dayDate: '2026-07-15', serviceKind: 'dinner' })).toEqual({
			titleEn: 'Chef’s table',
			titleFr: 'Dîner — mercredi 15 juillet 2026, 19h00',
		});
	});
});

// ---------------------------------------------------------------------------
// Venue Capacity with a per-Seating override (issue 021)
// ---------------------------------------------------------------------------

import { parseVenueCapacity } from '../../../src/lib/server/services/event-schedule';

describe('Seating capacity override in the payload', () => {
	it('keeps null as "inherit the Venue Capacity" and a number as the Seating\'s own', () => {
		const result = parseSeatingsPayload(servicesPayload([{
			seatings: [seatingPayload(), seatingPayload({ start: '14:00', capacityOverride: 8 })],
		}]));
		if (!result.ok) throw new Error('expected ok');
		expect(result.services[0].seatings.map((s) => s.seating.capacityOverride)).toEqual([null, 8]);
	});

	it('rejects an override outside 1..10 000 or not a whole number, and a missing one', () => {
		for (const capacityOverride of [0, 10001, 2.5, '12']) {
			expect(parseSeatingsPayload(servicesPayload([{ seatings: [seatingPayload({ capacityOverride })] }])))
				.toEqual({ ok: false, reason: 'seating' });
		}
		const { capacityOverride: _omitted, ...withoutOverride } = seatingPayload();
		expect(parseSeatingsPayload(servicesPayload([{ seatings: [withoutOverride] }])))
			.toEqual({ ok: false, reason: 'seating' });
	});
});

describe('parseVenueCapacity', () => {
	it('reads a whole number of places between 1 and 10 000', () => {
		expect(parseVenueCapacity('40')).toEqual({ ok: true, venueCapacity: 40 });
		expect(parseVenueCapacity(' 1 ')).toEqual({ ok: true, venueCapacity: 1 });
		expect(parseVenueCapacity('10000')).toEqual({ ok: true, venueCapacity: 10000 });
	});

	it('treats a blank or absent value as "unchanged"', () => {
		expect(parseVenueCapacity(null)).toEqual({ ok: true, venueCapacity: undefined });
		expect(parseVenueCapacity('  ')).toEqual({ ok: true, venueCapacity: undefined });
	});

	it('rejects zero, negatives, decimals, out-of-range and non-numbers', () => {
		for (const raw of ['0', '-3', '2.5', '10001', 'quarante', '1e3']) {
			expect(parseVenueCapacity(raw)).toEqual({ ok: false });
		}
	});
});

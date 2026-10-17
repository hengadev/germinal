import { describe, it, expect } from 'vitest';
import {
	DEFAULT_EVENT_TIME_ZONE,
	LUNCH_DINNER_CUTOFF_HOUR,
	clockOf,
	dayEnd,
	dayOf,
	dayStart,
	formatDayKey,
	formatSeatingDate,
	formatSeatingDateTime,
	formatSeatingTime,
	isValidTimeZone,
	listTimeZones,
	minutesOf,
	reconvertInstants,
	serviceKindOf,
	wallClockToInstant,
} from '../../../src/lib/utils/event-time';

const iso = (date: Date) => date.toISOString();

describe('wallClockToInstant / dayOf / minutesOf round-trips', () => {
	const cases: { zone: string; day: string; clock: string; utc: string }[] = [
		{ zone: 'Europe/Paris', day: '2026-07-15', clock: '20:00', utc: '2026-07-15T18:00:00.000Z' },
		{ zone: 'Europe/Paris', day: '2026-01-15', clock: '20:00', utc: '2026-01-15T19:00:00.000Z' },
		{ zone: 'Europe/London', day: '2026-07-15', clock: '20:00', utc: '2026-07-15T19:00:00.000Z' },
		{ zone: 'Europe/London', day: '2026-12-01', clock: '12:30', utc: '2026-12-01T12:30:00.000Z' },
		{ zone: 'America/New_York', day: '2026-07-15', clock: '19:00', utc: '2026-07-15T23:00:00.000Z' },
		{ zone: 'Asia/Tokyo', day: '2026-07-15', clock: '08:00', utc: '2026-07-14T23:00:00.000Z' },
		{ zone: 'Asia/Kolkata', day: '2026-07-15', clock: '13:15', utc: '2026-07-15T07:45:00.000Z' },
		{ zone: 'UTC', day: '2026-07-15', clock: '20:00', utc: '2026-07-15T20:00:00.000Z' },
	];

	for (const { zone, day, clock, utc } of cases) {
		it(`${day} ${clock} in ${zone} is ${utc} and back`, () => {
			const [h, m] = clock.split(':').map(Number);
			const instant = wallClockToInstant(day, h * 60 + m, zone);
			expect(iso(instant)).toBe(utc);
			expect(dayOf(instant, zone)).toBe(day);
			expect(minutesOf(instant, zone)).toBe(h * 60 + m);
			expect(clockOf(instant, zone)).toBe(clock);
		});
	}
});

describe('Europe/Paris DST transitions', () => {
	const zone = 'Europe/Paris';

	it('spring forward (29 March 2026): times either side keep their offsets', () => {
		expect(iso(wallClockToInstant('2026-03-29', 60, zone))).toBe('2026-03-29T00:00:00.000Z'); // 01:00 CET
		expect(iso(wallClockToInstant('2026-03-29', 3 * 60, zone))).toBe('2026-03-29T01:00:00.000Z'); // 03:00 CEST
		expect(iso(wallClockToInstant('2026-03-29', 20 * 60, zone))).toBe('2026-03-29T18:00:00.000Z');
	});

	it('spring forward: a time in the gap moves forward by the gap', () => {
		// 02:30 does not exist; it resolves to 03:30 CEST, like Temporal's "compatible".
		const instant = wallClockToInstant('2026-03-29', 2 * 60 + 30, zone);
		expect(iso(instant)).toBe('2026-03-29T01:30:00.000Z');
		expect(clockOf(instant, zone)).toBe('03:30');
	});

	it('fall back (25 October 2026): an ambiguous time takes the earlier instant', () => {
		const instant = wallClockToInstant('2026-10-25', 2 * 60 + 30, zone);
		expect(iso(instant)).toBe('2026-10-25T00:30:00.000Z'); // 02:30 CEST
		expect(clockOf(instant, zone)).toBe('02:30');
		expect(iso(wallClockToInstant('2026-10-25', 20 * 60, zone))).toBe('2026-10-25T19:00:00.000Z'); // CET
	});

	it('the Day bounds follow the shorter and longer Days', () => {
		expect(iso(dayStart('2026-03-29', zone))).toBe('2026-03-28T23:00:00.000Z');
		expect(iso(dayEnd('2026-03-29', zone))).toBe('2026-03-29T21:59:59.999Z');
		expect(iso(dayStart('2026-10-25', zone))).toBe('2026-10-24T22:00:00.000Z');
		expect(iso(dayEnd('2026-10-25', zone))).toBe('2026-10-25T22:59:59.999Z');
	});
});

describe('a Seating near midnight', () => {
	it('a 23:30 Paris dinner stays on its Day although it is the next Day in Tokyo', () => {
		const instant = wallClockToInstant('2026-07-15', 23 * 60 + 30, 'Europe/Paris');
		expect(iso(instant)).toBe('2026-07-15T21:30:00.000Z');
		expect(dayOf(instant, 'Europe/Paris')).toBe('2026-07-15');
		expect(dayOf(instant, 'Asia/Tokyo')).toBe('2026-07-16');
		expect(serviceKindOf(instant, 'Europe/Paris')).toBe('dinner');
	});

	it('00:15 in Paris belongs to the Day it starts on, which is the previous UTC Day', () => {
		const instant = wallClockToInstant('2026-07-16', 15, 'Europe/Paris');
		expect(iso(instant)).toBe('2026-07-15T22:15:00.000Z');
		expect(dayOf(instant, 'Europe/Paris')).toBe('2026-07-16');
	});
});

describe('serviceKindOf — the 16:00 local cut-off', () => {
	it('is 16:00 on the Event’s clock, not UTC', () => {
		expect(LUNCH_DINNER_CUTOFF_HOUR).toBe(16);
		// 15:30Z is 17:30 in Paris (summer): dinner.
		expect(serviceKindOf(new Date('2026-07-15T15:30:00Z'), 'Europe/Paris')).toBe('dinner');
		// 15:30Z is 11:30 in New York: lunch.
		expect(serviceKindOf(new Date('2026-07-15T15:30:00Z'), 'America/New_York')).toBe('lunch');
	});

	it('15:59 local is lunch, 16:00 local is dinner', () => {
		const zone = 'Europe/London';
		expect(serviceKindOf(wallClockToInstant('2026-07-15', 15 * 60 + 59, zone), zone)).toBe('lunch');
		expect(serviceKindOf(wallClockToInstant('2026-07-15', 16 * 60, zone), zone)).toBe('dinner');
	});
});

describe('formatSeatingTime / formatSeatingDate', () => {
	it('formats in the Event’s zone whatever the runtime zone, with no zone label', () => {
		const instant = wallClockToInstant('2026-07-15', 20 * 60, 'Europe/London');
		expect(formatSeatingTime(instant, 'Europe/London', 'en')).toBe('20:00');
		expect(formatSeatingTime(instant, 'Europe/London', 'fr')).toBe('20:00');
		expect(formatSeatingTime(instant.toISOString(), 'Europe/Paris', 'fr')).toBe('21:00');
	});

	it('formats the Day in the Event’s zone', () => {
		const instant = wallClockToInstant('2026-07-16', 15, 'Europe/Paris');
		expect(formatSeatingDate(instant, 'Europe/Paris', 'fr')).toBe('jeudi 16 juillet 2026');
		expect(formatSeatingDate(instant, 'Europe/Paris', 'en')).toBe('Thursday, 16 July 2026');
	});

	it('formats Day and time together for emails, in the Event’s zone', () => {
		const instant = wallClockToInstant('2026-07-15', 20 * 60, 'Europe/London');
		const text = formatSeatingDateTime(instant, 'Europe/London', 'en');
		expect(text).toContain('15 July 2026');
		expect(text).toContain('20:00');
		expect(text).not.toMatch(/GMT|BST|UTC/);
	});

	it('formats a Day key as a calendar date', () => {
		expect(formatDayKey('2026-07-16', 'fr')).toBe('jeudi 16 juillet 2026');
	});
});

describe('reconvertInstants — zone change keeps wall-clock times', () => {
	it('moves Paris 20:00 to London 20:00', () => {
		const paris = [
			wallClockToInstant('2026-07-15', 20 * 60, 'Europe/Paris'),
			wallClockToInstant('2026-01-15', 12 * 60, 'Europe/Paris'),
		];
		const london = reconvertInstants(paris, 'Europe/Paris', 'Europe/London');
		expect(london.map(iso)).toEqual(['2026-07-15T19:00:00.000Z', '2026-01-15T12:00:00.000Z']);
		expect(london.map((instant) => clockOf(instant, 'Europe/London'))).toEqual(['20:00', '12:00']);
		expect(london.map((instant) => dayOf(instant, 'Europe/London'))).toEqual(['2026-07-15', '2026-01-15']);
	});

	it('keeps the Day of a Seating near midnight', () => {
		const [moved] = reconvertInstants(
			[wallClockToInstant('2026-07-15', 23 * 60 + 45, 'Asia/Tokyo')],
			'Asia/Tokyo',
			'America/New_York'
		);
		expect(dayOf(moved, 'America/New_York')).toBe('2026-07-15');
		expect(clockOf(moved, 'America/New_York')).toBe('23:45');
	});

	it('is the identity when the zone does not change', () => {
		const instant = new Date('2026-07-15T18:00:00Z');
		expect(reconvertInstants([instant], 'Europe/Paris', 'Europe/Paris').map(iso)).toEqual([iso(instant)]);
	});
});

describe('time zone list', () => {
	it('validates IANA names', () => {
		expect(DEFAULT_EVENT_TIME_ZONE).toBe('Europe/Paris');
		expect(isValidTimeZone('Europe/London')).toBe(true);
		expect(isValidTimeZone('Mars/Olympus')).toBe(false);
		expect(isValidTimeZone('')).toBe(false);
	});

	it('lists IANA zones including the default', () => {
		const zones = listTimeZones();
		expect(zones).toContain('Europe/Paris');
		expect(zones).toContain('Europe/London');
		expect(zones.every(isValidTimeZone)).toBe(true);
	});
});

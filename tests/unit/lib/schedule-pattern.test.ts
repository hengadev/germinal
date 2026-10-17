import { describe, it, expect } from 'vitest';
import {
	planSchedulePattern,
	servedKinds,
	type PatternSourceSeating,
	type PatternSourceService,
} from '../../../src/lib/utils/schedule-pattern';
import { wallClockToInstant } from '../../../src/lib/utils/event-time';
import { DEFAULT_SERVICE_DURATION_MINUTES } from '../../../src/lib/utils/seating-times';

const PARIS = 'Europe/Paris';

function seating(
	day: string,
	start: string,
	end: string,
	overrides: Partial<PatternSourceSeating> = {},
	zone = PARIS
): PatternSourceSeating {
	const minutes = (clock: string) => {
		const [h, m] = clock.split(':').map(Number);
		return h * 60 + m;
	};
	return {
		startTime: wallClockToInstant(day, minutes(start), zone),
		endTime: wallClockToInstant(day, minutes(end), zone),
		totalCapacity: 24,
		capacityOverridden: false,
		titleEn: null,
		titleFr: null,
		descriptionEn: null,
		descriptionFr: null,
		badgeType: 'none',
		published: true,
		allowWaitlist: false,
		...overrides,
	};
}

function service(overrides: Partial<PatternSourceService> & Pick<PatternSourceService, 'date' | 'kind'>): PatternSourceService {
	return {
		defaultSeatingDurationMinutes: 90,
		menuId: null,
		priceAmount: null,
		seatings: [],
		...overrides,
	};
}

describe('servedKinds', () => {
	it('lists the meal kinds the source serves, lunch first', () => {
		expect(servedKinds([{ kind: 'dinner' }, { kind: 'lunch' }, { kind: 'dinner' }])).toEqual(['lunch', 'dinner']);
		expect(servedKinds([{ kind: 'dinner' }])).toEqual(['dinner']);
		expect(servedKinds([])).toEqual([]);
	});
});

describe('planSchedulePattern', () => {
	const lunchSource = service({
		date: '2099-03-10',
		kind: 'lunch',
		defaultSeatingDurationMinutes: 75,
		menuId: 'menu-lunch',
		priceAmount: 4500,
		seatings: [
			seating('2099-03-10', '13:30', '15:00', { capacityOverridden: true, totalCapacity: 8, titleFr: 'Second service', titleEn: 'Second seating', badgeType: 'vip' }),
			seating('2099-03-10', '12:00', '13:15', { badgeType: 'popular', allowWaitlist: true }),
		],
	});

	it('gives every new lunch the first lunch pattern and leaves a missing dinner empty', () => {
		const later = service({
			date: '2099-03-11',
			kind: 'lunch',
			defaultSeatingDurationMinutes: 200,
			menuId: 'other',
			priceAmount: 1,
			seatings: [seating('2099-03-11', '11:00', '12:00')],
		});
		const plan = planSchedulePattern([later, lunchSource], [
			{ date: '2099-07-02', kinds: ['dinner', 'lunch'] },
			{ date: '2099-07-01', kinds: ['lunch'] },
		], PARIS);

		expect(plan.map((s) => `${s.date}:${s.kind}`)).toEqual([
			'2099-07-01:lunch',
			'2099-07-02:lunch',
			'2099-07-02:dinner',
		]);

		for (const lunch of plan.filter((s) => s.kind === 'lunch')) {
			expect(lunch).toMatchObject({ defaultSeatingDurationMinutes: 75, menuId: 'menu-lunch', priceAmount: 4500 });
			expect(lunch.seatings.map((s) => [s.startMinutes, s.endMinutes])).toEqual([[720, 795], [810, 900]]);
			expect(lunch.seatings[0].startTime).toEqual(wallClockToInstant(lunch.date, 720, PARIS));
			expect(lunch.seatings[1].endTime).toEqual(wallClockToInstant(lunch.date, 900, PARIS));
		}

		expect(plan[2]).toEqual({
			date: '2099-07-02',
			kind: 'dinner',
			defaultSeatingDurationMinutes: DEFAULT_SERVICE_DURATION_MINUTES.dinner,
			menuId: null,
			priceAmount: null,
			seatings: [],
		});
	});

	it('keeps capacity overrides, titles and Badges, and inherits the Venue Capacity otherwise', () => {
		const [lunch] = planSchedulePattern([lunchSource], [{ date: '2099-07-01', kinds: ['lunch'] }], PARIS);
		expect(lunch.seatings[0]).toMatchObject({
			capacityOverride: null,
			titleFr: null,
			badgeType: 'popular',
			allowWaitlist: true,
			published: true,
		});
		expect(lunch.seatings[1]).toMatchObject({
			capacityOverride: 8,
			titleFr: 'Second service',
			titleEn: 'Second seating',
			badgeType: 'vip',
		});
	});

	it('keeps wall-clock times across a daylight-saving change', () => {
		// Winter source (UTC+1) onto a summer Day (UTC+2): same local 19:30.
		const dinner = service({
			date: '2099-01-15',
			kind: 'dinner',
			seatings: [seating('2099-01-15', '19:30', '21:30')],
		});
		const [planned] = planSchedulePattern([dinner], [{ date: '2099-07-15', kinds: ['dinner'] }], PARIS);
		expect(planned.seatings[0].startMinutes).toBe(19 * 60 + 30);
		expect(planned.seatings[0].startTime.toISOString()).toBe('2099-07-15T17:30:00.000Z');
	});

	it('reads the times in the Event Time Zone and keeps an end past midnight', () => {
		const zone = 'America/New_York';
		const dinner = service({
			date: '2099-05-01',
			kind: 'dinner',
			seatings: [seating('2099-05-01', '22:30', '23:59', {
				endTime: wallClockToInstant('2099-05-01', 24 * 60 + 30, zone),
			}, zone)],
		});
		const [planned] = planSchedulePattern([dinner], [{ date: '2099-05-08', kinds: ['dinner'] }], zone);
		expect([planned.seatings[0].startMinutes, planned.seatings[0].endMinutes]).toEqual([1350, 1470]);
		expect(planned.seatings[0].endTime).toEqual(wallClockToInstant('2099-05-09', 30, zone));
	});

	it('creates nothing for no Days', () => {
		expect(planSchedulePattern([lunchSource], [], PARIS)).toEqual([]);
	});
});

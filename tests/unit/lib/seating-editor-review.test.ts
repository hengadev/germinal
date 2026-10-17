import { describe, it, expect } from 'vitest';
import { reviewServiceSeatings } from '../../../src/lib/utils/seating-times';
import { seatingTitle, seatingTitlesWithFallback } from '../../../src/lib/utils/seating-title';

describe('reviewServiceSeatings (admin Seatings editor, before saving)', () => {
	it('fills each end from the Service default duration', () => {
		const reviews = reviewServiceSeatings('lunch', 90, [
			{ start: '12:00', end: null },
			{ start: '13:30', end: '' },
		]);
		expect(reviews.map((review) => [review.startMinutes, review.endMinutes])).toEqual([
			[720, 810],
			[810, 900],
		]);
		expect(reviews.every((review) => review.timeError === null)).toBe(true);
	});

	it('keeps an overridden end, refusing one at or before the start', () => {
		const reviews = reviewServiceSeatings('dinner', 120, [
			{ start: '19:00', end: '22:30' },
			{ start: '21:00', end: '21:00' },
			{ start: '20:00', end: 'later' },
		]);
		expect(reviews[0]).toMatchObject({ endMinutes: 1350, timeError: null });
		expect(reviews[1].timeError).toBe('end');
		expect(reviews[2].timeError).toBe('end');
	});

	it('flags an invalid start and a filled end reaching midnight', () => {
		const reviews = reviewServiceSeatings('dinner', 180, [
			{ start: '25:00', end: null },
			{ start: '21:00', end: null },
		]);
		expect(reviews[0].timeError).toBe('start');
		expect(reviews[1].timeError).toBe('midnight');
	});

	it('flags a Seating starting before the previous one ends', () => {
		const reviews = reviewServiceSeatings('lunch', 90, [
			{ start: '12:00', end: null },
			{ start: '13:00', end: null },
		]);
		expect(reviews[0].overlapsPreviousEndingAt).toBeNull();
		expect(reviews[1].overlapsPreviousEndingAt).toBe(810);
	});

	it('does not flag a perfect turn-over nor Seatings typed out of order', () => {
		const reviews = reviewServiceSeatings('lunch', 90, [
			{ start: '13:30', end: null },
			{ start: '12:00', end: null },
		]);
		expect(reviews.map((review) => review.overlapsPreviousEndingAt)).toEqual([null, null]);
	});

	it('ignores Seatings with invalid times when looking for overlaps', () => {
		const reviews = reviewServiceSeatings('lunch', 90, [
			{ start: 'xx', end: null },
			{ start: '12:00', end: null },
		]);
		expect(reviews[1].overlapsPreviousEndingAt).toBeNull();
	});

	it('flags a start on the wrong side of the 16:00 cut-off', () => {
		const lunch = reviewServiceSeatings('lunch', 60, [{ start: '16:00', end: null }]);
		const dinner = reviewServiceSeatings('dinner', 60, [{ start: '15:59', end: null }]);
		expect(lunch[0].mealMismatch).toBe(true);
		expect(dinner[0].mealMismatch).toBe(true);
		expect(reviewServiceSeatings('lunch', 60, [{ start: '15:59', end: null }])[0].mealMismatch).toBe(false);
	});
});

describe('seatingTitle (shared display title)', () => {
	// 19:00 in Paris (summer time, UTC+2).
	const startTime = new Date('2099-06-10T17:00:00Z');
	const paris = { timeZone: 'Europe/Paris' };

	it('derives a never-empty label from Day, Service and time when no title is stored', () => {
		expect(seatingTitle({ titleEn: null, titleFr: null, startTime }, 'fr', paris)).toBe('Dîner — mercredi 10 juin 2099, 19h00');
		expect(seatingTitle({ titleEn: null, titleFr: null, startTime }, 'en', paris)).toBe('Dinner — Wednesday, 10 June 2099, 19:00');
	});

	it('treats blank titles as missing and keeps real ones', () => {
		expect(seatingTitle({ titleEn: '   ', startTime: startTime.toISOString() }, 'en', paris)).toMatch(/^Dinner — /);
		expect(seatingTitlesWithFallback({ titleEn: 'Chef’s table', titleFr: '', startTime }, paris)).toEqual({
			titleEn: 'Chef’s table',
			titleFr: 'Dîner — mercredi 10 juin 2099, 19h00',
		});
	});

	it('uses the Service context over the start time when given', () => {
		expect(
			seatingTitle({ startTime: '2099-06-10T13:30:00Z' }, 'fr', { ...paris, serviceKind: 'dinner', dayDate: '2099-06-10' })
		).toBe('Dîner — mercredi 10 juin 2099, 15h30');
	});

	it('reads the time in the Event’s Time Zone, not UTC', () => {
		// 20:00 in London is 19:00Z; the label says 20h00 whatever the runtime zone.
		const london = new Date('2099-06-10T19:00:00Z');
		expect(seatingTitle({ startTime: london }, 'fr', { timeZone: 'Europe/London' })).toBe(
			'Dîner — mercredi 10 juin 2099, 20h00'
		);
		// 15:30Z is 17:30 in Paris: dinner, although it is before 16:00 UTC.
		expect(seatingTitle({ startTime: '2099-06-10T15:30:00Z' }, 'en', paris)).toBe(
			'Dinner — Wednesday, 10 June 2099, 17:30'
		);
		// 23:30 in Paris on the 10th is 21:30Z, on the 11th in Tokyo.
		expect(seatingTitle({ startTime: '2099-06-10T21:30:00Z' }, 'fr', paris)).toBe(
			'Dîner — mercredi 10 juin 2099, 23h30'
		);
	});
});

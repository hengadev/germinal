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

	it('flags a start on the wrong side of the 16:00 UTC cut-off', () => {
		const lunch = reviewServiceSeatings('lunch', 60, [{ start: '16:00', end: null }]);
		const dinner = reviewServiceSeatings('dinner', 60, [{ start: '15:59', end: null }]);
		expect(lunch[0].mealMismatch).toBe(true);
		expect(dinner[0].mealMismatch).toBe(true);
		expect(reviewServiceSeatings('lunch', 60, [{ start: '15:59', end: null }])[0].mealMismatch).toBe(false);
	});
});

describe('seatingTitle (shared display title)', () => {
	const startTime = new Date('2099-06-10T19:00:00Z');

	it('derives a never-empty label from Day, Service and time when no title is stored', () => {
		expect(seatingTitle({ titleEn: null, titleFr: null, startTime }, 'fr')).toBe('Dîner — mercredi 10 juin 2099, 19h00');
		expect(seatingTitle({ titleEn: null, titleFr: null, startTime }, 'en')).toBe('Dinner — Wednesday, 10 June 2099, 19:00');
	});

	it('treats blank titles as missing and keeps real ones', () => {
		expect(seatingTitle({ titleEn: '   ', startTime: startTime.toISOString() }, 'en')).toMatch(/^Dinner — /);
		expect(seatingTitlesWithFallback({ titleEn: 'Chef’s table', titleFr: '', startTime })).toEqual({
			titleEn: 'Chef’s table',
			titleFr: 'Dîner — mercredi 10 juin 2099, 19h00',
		});
	});

	it('uses the Service context over the start time when given', () => {
		expect(
			seatingTitle({ startTime: '2099-06-10T15:30:00Z' }, 'fr', { serviceKind: 'dinner', dayDate: '2099-06-10' })
		).toBe('Dîner — mercredi 10 juin 2099, 15h30');
	});
});

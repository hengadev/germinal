import { describe, it, expect } from 'vitest';
import { reviewSeatingTemplate, startsToAdd } from '../../../src/lib/utils/seating-template';

describe('reviewSeatingTemplate', () => {
	it('returns the starts in minutes, sorted and de-duplicated', () => {
		expect(reviewSeatingTemplate('dinner', ['21:30', '19:00', '19:00'], 120)).toEqual({
			ok: true,
			startMinutes: [19 * 60, 21 * 60 + 30],
		});
	});

	it('needs at least one start', () => {
		expect(reviewSeatingTemplate('lunch', [], 90)).toEqual({ ok: false, error: { reason: 'empty' } });
	});

	it('needs a whole duration between 1 and 1440 minutes', () => {
		for (const duration of [null, 0, 1441, 90.5]) {
			expect(reviewSeatingTemplate('lunch', ['12:00'], duration)).toEqual({ ok: false, error: { reason: 'duration' } });
		}
	});

	it('points at an invalid time', () => {
		expect(reviewSeatingTemplate('lunch', ['12:00', ''], 90)).toEqual({ ok: false, error: { reason: 'start', index: 1 } });
	});

	it('keeps each start in its meal window (16:00 UTC cut-off)', () => {
		expect(reviewSeatingTemplate('lunch', ['16:00'], 60)).toEqual({ ok: false, error: { reason: 'meal', index: 0 } });
		expect(reviewSeatingTemplate('dinner', ['15:59'], 60)).toEqual({ ok: false, error: { reason: 'meal', index: 0 } });
		expect(reviewSeatingTemplate('lunch', ['15:59'], 60).ok).toBe(true);
		expect(reviewSeatingTemplate('dinner', ['16:00'], 60).ok).toBe(true);
	});

	it('refuses a Seating that would end at or after midnight', () => {
		expect(reviewSeatingTemplate('dinner', ['22:00'], 120)).toEqual({ ok: false, error: { reason: 'midnight', index: 0 } });
		expect(reviewSeatingTemplate('dinner', ['22:00'], 119).ok).toBe(true);
	});
});

describe('startsToAdd', () => {
	it('skips starts the Service already has', () => {
		expect(startsToAdd(['19:00', '9:30'], [9 * 60 + 30, 19 * 60, 21 * 60 + 30])).toEqual([21 * 60 + 30]);
	});

	it('ignores unparseable existing starts', () => {
		expect(startsToAdd([''], [12 * 60])).toEqual([12 * 60]);
	});
});

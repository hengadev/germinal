// @vitest-environment node
/**
 * Issue 058 — the pure rates and Service × weekday averages of the Admin
 * Bilan page: guest weighting, null capacity, the 3-Seating cut-off and
 * the weekday taken from the Day's calendar date.
 */
import { describe, it, expect } from 'vitest';
import {
	summarizeEvent,
	weekdayFromDayDate,
	computeAverages,
	MIN_SEATINGS_FOR_AVERAGE,
	type BilanSeatingRow
} from '../../../src/lib/utils/bilan';

function row(overrides: Partial<BilanSeatingRow> = {}): BilanSeatingRow {
	return {
		eventId: 'e1',
		date: '2025-06-11',
		kind: 'dinner',
		booked: 10,
		arrived: 8,
		noShows: 2,
		walkInGuests: 0,
		compGuests: 0,
		totalCapacity: 10,
		...overrides
	};
}

describe('summarizeEvent', () => {
	it('sums the Seatings and weights the rates by guests', () => {
		const summary = summarizeEvent([
			row({ booked: 10, arrived: 9, noShows: 1, walkInGuests: 3, compGuests: 2, totalCapacity: 10 }),
			row({ booked: 30, arrived: 20, noShows: 10, walkInGuests: 0, compGuests: 0, totalCapacity: 30 })
		]);
		expect(summary.booked).toBe(40);
		expect(summary.arrived).toBe(29);
		expect(summary.noShows).toBe(11);
		expect(summary.walkInGuests).toBe(3);
		expect(summary.compGuests).toBe(2);
		expect(summary.capacity).toBe(40);
		// 29/40, not an average of per-Seating rates.
		expect(summary.fillRate).toBeCloseTo(29 / 40);
		expect(summary.noShowRate).toBeCloseTo(11 / 40);
	});

	it('leaves the fill rate blank without capacity, summing the Seatings that have one', () => {
		const none = summarizeEvent([row({ totalCapacity: null })]);
		expect(none.capacity).toBeNull();
		expect(none.fillRate).toBeNull();

		const mixed = summarizeEvent([
			row({ totalCapacity: null }),
			row({ totalCapacity: 20, arrived: 10, booked: 10, noShows: 0 })
		]);
		expect(mixed.capacity).toBe(20);
		// Only the Seating with a capacity fills: its 10 guests, not the other's 8.
		expect(mixed.arrived).toBe(18);
		expect(mixed.fillRate).toBeCloseTo(10 / 20);
	});

	it('leaves the No-show rate blank without bookings', () => {
		const summary = summarizeEvent([row({ booked: 0, noShows: 0 })]);
		expect(summary.noShowRate).toBeNull();
	});
});

describe('weekdayFromDayDate', () => {
	it('reads the weekday off the calendar date, with no time-zone shift', () => {
		// 2025-06-11 is a Wednesday wherever you read it.
		expect(weekdayFromDayDate('2025-06-11')).toBe(3);
		expect(weekdayFromDayDate('2025-06-08')).toBe(0); // Sunday
		expect(weekdayFromDayDate('2025-06-14')).toBe(6); // Saturday
	});
});

describe('computeAverages', () => {
	it('groups by Service kind × weekday, weighting by guests', () => {
		const cells = computeAverages([
			row({ date: '2025-06-09', kind: 'lunch', booked: 10, noShows: 5, walkInGuests: 6 }),
			row({ date: '2025-06-16', kind: 'lunch', booked: 30, noShows: 0, walkInGuests: 0 }),
			row({ date: '2025-06-23', kind: 'lunch', booked: 10, noShows: 5, walkInGuests: 3 })
		]);
		expect(cells).toHaveLength(1);
		const cell = cells[0];
		expect(cell.kind).toBe('lunch');
		expect(cell.weekday).toBe(1); // Monday
		expect(cell.seatings).toBe(3);
		// 10/50 weighted, not an average of 50 %, 0 % and 50 %.
		expect(cell.noShowRate).toBeCloseTo(10 / 50);
		expect(cell.walkInsPerSeating).toBeCloseTo(3);
	});

	it('leaves a cell blank with fewer than 3 Seatings', () => {
		const cells = computeAverages([
			row({ date: '2025-06-11', kind: 'dinner' }),
			row({ date: '2025-06-18', kind: 'dinner' })
		]);
		expect(cells[0].seatings).toBe(2);
		expect(cells[0].noShowRate).toBeNull();
		expect(cells[0].walkInsPerSeating).toBeNull();
		expect(MIN_SEATINGS_FOR_AVERAGE).toBe(3);
	});

	it('keeps separate cells per kind and orders lunch before dinner', () => {
		const cells = computeAverages([
			row({ date: '2025-06-11', kind: 'dinner' }),
			row({ date: '2025-06-11', kind: 'lunch' }),
			row({ date: '2025-06-11', kind: 'lunch' }),
			row({ date: '2025-06-11', kind: 'lunch' })
		]);
		expect(cells.map((c) => `${c.kind}:${c.weekday}`)).toEqual(['lunch:3', 'dinner:3']);
		expect(cells[0].noShowRate).not.toBeNull();
		expect(cells[1].noShowRate).toBeNull();
	});
});

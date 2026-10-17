import { describe, it, expect } from 'vitest';
import {
	bookingClosesAt,
	bookingWindowState,
	DEFAULT_BOOKING_WINDOW,
	MAX_CLOSING_HOURS,
	parseBookingWindow,
	type BookingWindow,
} from '../../../src/lib/utils/booking-window';
import { wallClockToInstant } from '../../../src/lib/utils/event-time';

const START = new Date('2099-06-10T19:00:00Z');
const OPENS = new Date('2099-06-01T08:00:00Z');
const MS = 1;
const HOUR = 60 * 60 * 1000;

const at = (date: Date, offsetMs: number) => new Date(date.getTime() + offsetMs);

describe('bookingClosesAt', () => {
	it('is the Seating start by default', () => {
		expect(bookingClosesAt(DEFAULT_BOOKING_WINDOW, START)).toEqual(START);
	});

	it('is N hours before the start when set', () => {
		expect(bookingClosesAt({ opensAt: null, closesHoursBefore: 24 }, START)).toEqual(at(START, -24 * HOUR));
	});

	it('is the start for 0 hours', () => {
		expect(bookingClosesAt({ opensAt: null, closesHoursBefore: 0 }, START)).toEqual(START);
	});
});

describe('bookingWindowState', () => {
	describe('without settings', () => {
		const window = DEFAULT_BOOKING_WINDOW;

		it('is open long before the Seating', () => {
			expect(bookingWindowState(window, START, new Date('2000-01-01T00:00:00Z'))).toEqual({ state: 'open' });
		});

		it('is open just before the start', () => {
			expect(bookingWindowState(window, START, at(START, -MS))).toEqual({ state: 'open' });
		});

		it('is closed at the start', () => {
			expect(bookingWindowState(window, START, START)).toEqual({ state: 'closed', closedAt: START });
		});

		it('is closed after the start', () => {
			expect(bookingWindowState(window, START, at(START, HOUR))).toEqual({ state: 'closed', closedAt: START });
		});
	});

	describe('with an opening instant only', () => {
		const window: BookingWindow = { opensAt: OPENS, closesHoursBefore: null };

		it('is not open before it, and says when it opens', () => {
			expect(bookingWindowState(window, START, at(OPENS, -MS))).toEqual({ state: 'not-open', opensAt: OPENS });
		});

		it('is open at it', () => {
			expect(bookingWindowState(window, START, OPENS)).toEqual({ state: 'open' });
		});

		it('is open after it', () => {
			expect(bookingWindowState(window, START, at(OPENS, MS))).toEqual({ state: 'open' });
		});

		it('still closes at the start', () => {
			expect(bookingWindowState(window, START, at(START, -MS))).toEqual({ state: 'open' });
			expect(bookingWindowState(window, START, START)).toEqual({ state: 'closed', closedAt: START });
		});
	});

	describe('with closing hours only', () => {
		const window: BookingWindow = { opensAt: null, closesHoursBefore: 48 };
		const closes = at(START, -48 * HOUR);

		it('is open before the closing instant', () => {
			expect(bookingWindowState(window, START, at(closes, -MS))).toEqual({ state: 'open' });
		});

		it('is closed at it', () => {
			expect(bookingWindowState(window, START, closes)).toEqual({ state: 'closed', closedAt: closes });
		});

		it('is closed after it, before the start', () => {
			expect(bookingWindowState(window, START, at(closes, HOUR))).toEqual({ state: 'closed', closedAt: closes });
		});
	});

	describe('with both', () => {
		const window: BookingWindow = { opensAt: OPENS, closesHoursBefore: 2 };
		const closes = at(START, -2 * HOUR);

		it.each([
			['just before opening', at(OPENS, -MS), { state: 'not-open', opensAt: OPENS }],
			['at opening', OPENS, { state: 'open' }],
			['just after opening', at(OPENS, MS), { state: 'open' }],
			['just before closing', at(closes, -MS), { state: 'open' }],
			['at closing', closes, { state: 'closed', closedAt: closes }],
			['just after closing', at(closes, MS), { state: 'closed', closedAt: closes }],
		])('%s', (_, now, expected) => {
			expect(bookingWindowState(window, START, now)).toEqual(expected);
		});
	});

	it('opening after the Seating closes: not open until then, closed from the closing instant', () => {
		const window: BookingWindow = { opensAt: at(START, HOUR), closesHoursBefore: null };
		expect(bookingWindowState(window, START, at(START, -MS))).toEqual({ state: 'not-open', opensAt: at(START, HOUR) });
		expect(bookingWindowState(window, START, START)).toEqual({ state: 'closed', closedAt: START });
	});
});

describe('parseBookingWindow', () => {
	const paris = (day: string, minutes: number) => wallClockToInstant(day, minutes, 'Europe/Paris');

	it('leaves both unset when blank', () => {
		expect(parseBookingWindow('', '', paris)).toEqual({ ok: true, window: DEFAULT_BOOKING_WINDOW });
		expect(parseBookingWindow(null, null, paris)).toEqual({ ok: true, window: DEFAULT_BOOKING_WINDOW });
		expect(parseBookingWindow('  ', ' ', paris)).toEqual({ ok: true, window: DEFAULT_BOOKING_WINDOW });
	});

	it('reads the opening date-time on the Event clock', () => {
		// 10:00 in Paris in June is 08:00 UTC.
		expect(parseBookingWindow('2099-06-01T10:00', '', paris)).toEqual({
			ok: true,
			window: { opensAt: new Date('2099-06-01T08:00:00Z'), closesHoursBefore: null },
		});
		const london = (day: string, minutes: number) => wallClockToInstant(day, minutes, 'Europe/London');
		expect(parseBookingWindow('2099-06-01T10:00', '', london)).toEqual({
			ok: true,
			window: { opensAt: new Date('2099-06-01T09:00:00Z'), closesHoursBefore: null },
		});
	});

	it('reads the closing hours', () => {
		expect(parseBookingWindow('', '24', paris)).toEqual({ ok: true, window: { opensAt: null, closesHoursBefore: 24 } });
		expect(parseBookingWindow('', '0', paris)).toEqual({ ok: true, window: { opensAt: null, closesHoursBefore: 0 } });
		expect(parseBookingWindow('', String(MAX_CLOSING_HOURS), paris).ok).toBe(true);
	});

	it.each([['tomorrow'], ['2099-13-01T10:00'], ['2099-02-30T10:00'], ['2099-06-01T24:00'], ['2099-06-01']])(
		'refuses the opening %s',
		(raw) => {
			expect(parseBookingWindow(raw, '', paris)).toEqual({ ok: false, reason: 'invalid-opening' });
		}
	);

	it.each([['-1'], ['1.5'], ['abc'], [String(MAX_CLOSING_HOURS + 1)]])('refuses the closing hours %s', (raw) => {
		expect(parseBookingWindow('', raw, paris)).toEqual({ ok: false, reason: 'invalid-closing-hours' });
	});
});

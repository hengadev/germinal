// Issue 054 — the Thank-you send window: from 10:00 (the Event's clock)
// the morning after a Day, until 3 days after the Day ended, DST included.
import { describe, it, expect } from 'vitest';
import {
	thankYouSendWindow,
	isInThankYouSendWindow,
	THANK_YOU_SEND_HOUR,
} from '../../../src/lib/utils/thank-you-window';

const PARIS = 'Europe/Paris';

describe('thankYouSendWindow', () => {
	it('opens at 10:00 the morning after, on the Event’s clock', () => {
		// 2024-01-10, Paris on UTC+1: 10:00 local = 09:00 UTC.
		const { start, end } = thankYouSendWindow('2024-01-10', PARIS);
		expect(start.toISOString()).toBe('2024-01-11T09:00:00.000Z');
		// The Day ends 2024-01-11 06:00 local; three days later is
		// 2024-01-14 06:00 local = 05:00 UTC.
		expect(end.toISOString()).toBe('2024-01-14T05:00:00.000Z');
	});

	it('follows DST across the spring-forward night (Europe/Paris 2024-03-31)', () => {
		// The Day 2024-03-30 ends after the clocks jump: 06:00 on 2024-03-31
		// local is already UTC+2, and so is 10:00 that morning (08:00 UTC).
		const { start, end } = thankYouSendWindow('2024-03-30', PARIS);
		expect(start.toISOString()).toBe('2024-03-31T08:00:00.000Z');
		expect(end.toISOString()).toBe('2024-04-03T04:00:00.000Z');
	});

	it('follows DST across a fall-back change', () => {
		// Day 2024-10-25: the window opens 2024-10-26 10:00, still on UTC+2
		// (08:00 UTC — Paris falls back only on 2024-10-27); it closes
		// 2024-10-29 06:00 local, back on UTC+1 (05:00 UTC).
		const { start, end } = thankYouSendWindow('2024-10-25', PARIS);
		expect(start.toISOString()).toBe('2024-10-26T08:00:00.000Z');
		expect(end.toISOString()).toBe('2024-10-29T05:00:00.000Z');
	});
});

describe('isInThankYouSendWindow', () => {
	it('is closed before 10:00 the morning after, and the night before', () => {
		expect(isInThankYouSendWindow('2024-01-10', PARIS, new Date('2024-01-10T21:00:00Z'))).toBe(false);
		expect(isInThankYouSendWindow('2024-01-10', PARIS, new Date('2024-01-11T05:00:00Z'))).toBe(false);
		// 09:59 local (08:59 UTC): still closed.
		expect(isInThankYouSendWindow('2024-01-10', PARIS, new Date('2024-01-11T08:59:00Z'))).toBe(false);
	});

	it('opens at 10:00 local', () => {
		const opens = thankYouSendWindow('2024-01-10', PARIS).start;
		expect(isInThankYouSendWindow('2024-01-10', PARIS, opens)).toBe(true);
		expect(opens.getUTCHours()).toBe(THANK_YOU_SEND_HOUR - 1); // Paris on UTC+1
	});

	it('closes 3 days after the Day ended', () => {
		const { end } = thankYouSendWindow('2024-01-10', PARIS);
		expect(isInThankYouSendWindow('2024-01-10', PARIS, new Date(end.getTime() - 1))).toBe(true);
		expect(isInThankYouSendWindow('2024-01-10', PARIS, end)).toBe(false);
		// A Day ended more than 3 days ago is never in the window again.
		expect(isInThankYouSendWindow('2024-01-10', PARIS, new Date('2024-01-20T12:00:00Z'))).toBe(false);
	});

	it('uses the Event’s own Time Zone', () => {
		// Same instant, New York (UTC-5 in January) still before 10:00,
		// Paris already inside the window.
		const now = new Date('2024-01-11T13:00:00Z'); // 14:00 Paris, 08:00 New York
		expect(isInThankYouSendWindow('2024-01-10', PARIS, now)).toBe(true);
		expect(isInThankYouSendWindow('2024-01-10', 'America/New_York', now)).toBe(false);
	});
});

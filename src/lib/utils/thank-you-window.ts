/**
 * Post-event Thank-you send window (issue 054).
 *
 * A Day's Guests are thanked the morning after: from 10:00 on the Event's
 * clock (ADR 0006) once the Day has ended (6 a.m. the next morning, the
 * same Day end the Staff portal uses) and, at the latest, until the Day
 * ended 3 days ago — so turning the Thank-you on late never mails old
 * Guests. All instants are wall-clock times on the Event's clock, DST
 * included.
 */
import { wallClockToInstant } from './event-time';

/** Hour, on the Event's clock, from which the morning's Thank-yous go out. */
export const THANK_YOU_SEND_HOUR = 10;

/** Minutes after midnight at which a Day ends (6 a.m. the next morning). */
const DAY_END_MINUTES = 6 * 60;

/** How many days after a Day ended its Guests can still be thanked. */
export const THANK_YOU_MAX_DAYS_AFTER = 3;

export interface ThankYouSendWindow {
	/** 10:00 the morning after the Day, on the Event's clock. */
	start: Date;
	/** The Day's end (6 a.m.) plus 3 days, on the Event's clock. */
	end: Date;
}

/** The window in which a Day's Guests may be thanked. */
export function thankYouSendWindow(day: string, timeZone: string): ThankYouSendWindow {
	return {
		// 10:00 the morning after: 24 h after local midnight plus 10 h.
		start: wallClockToInstant(day, 24 * 60 + THANK_YOU_SEND_HOUR * 60, timeZone),
		// The Day ends at 6 a.m. the next morning; three days later it is
		// too late. Both on the wall clock, so DST shifts are followed.
		end: wallClockToInstant(
			day,
			24 * 60 + DAY_END_MINUTES + THANK_YOU_MAX_DAYS_AFTER * 24 * 60,
			timeZone
		),
	};
}

/** Whether `now` (an instant) falls in the Day's Thank-you window. */
export function isInThankYouSendWindow(day: string, timeZone: string, now: Date): boolean {
	const instant = now.getTime();
	const { start, end } = thankYouSendWindow(day, timeZone);
	return instant >= start.getTime() && instant < end.getTime();
}

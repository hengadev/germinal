import { expireClosedWaitlistEntries } from '../services/waitlist';
import { jobLogger } from '../logger';

/**
 * Expire the Waitlist entries of Seatings whose Booking Window has closed
 * (issue 035). Run every 5 minutes via pg-boss.
 */
export async function expireClosedWaitlists() {
	const result = await expireClosedWaitlistEntries();
	if (result.expired > 0) {
		jobLogger.info({ expired: result.expired }, '[Waitlist Job] Expired entries of closed Seatings');
	}
	return result;
}

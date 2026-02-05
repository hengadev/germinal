import { db } from '../db';
import { logger } from '$lib/server/logger';
import { reservations, eventSessions } from '../db/schema';
import { eq, and, gt, lte, sql } from 'drizzle-orm';

interface ReminderResult {
	processed: number;
	sent1Week: number;
	sent1Day: number;
	failed: number;
}

/**
 * Send event reminders to confirmed reservations
 * This job runs daily at 9 AM and sends reminders for:
 * - Sessions starting in 7 days (if reminderSent1Week = false)
 * - Sessions starting in 1 day (if reminderSent1Day = false)
 */
export async function sendEventReminders(): Promise<ReminderResult> {
	const now = new Date();

	// Calculate time ranges
	const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const endOfOneDayFromNow = new Date(oneDayFromNow);
	endOfOneDayFromNow.setHours(23, 59, 59, 999);

	const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
	const endOfSevenDaysFromNow = new Date(sevenDaysFromNow);
	endOfSevenDaysFromNow.setHours(23, 59, 59, 999);

	logger.info('[Event Reminders] Starting reminder job...');

	let sent1Week = 0;
	let sent1Day = 0;
	let failed = 0;

	// Find reservations needing 1-week reminder
	const oneWeekReservations = await db.query.reservations.findMany({
		where: and(
			eq(reservations.status, 'confirmed'),
			eq(reservations.reminderSent1Week, false)
		),
		with: {
			eventSession: {
				with: {
					event: true
				}
			},
			payment: true
		}
	});

	// Filter for sessions starting in 7 days
	const reservationsFor1Week = oneWeekReservations.filter((r: typeof oneWeekReservations[number]) => {
		const sessionStart = new Date(r.eventSession.startTime);
		return sessionStart >= sevenDaysFromNow && sessionStart <= endOfSevenDaysFromNow;
	});

	logger.info(`[Event Reminders] Found ${reservationsFor1Week.length} reservations for 1-week reminder`);

	// Send 1-week reminders
	for (const reservation of reservationsFor1Week) {
		try {
			await sendReminder(reservation, '1week');
			await db.update(reservations)
				.set({ reminderSent1Week: true, updatedAt: new Date() })
				.where(eq(reservations.id, reservation.id));
			sent1Week++;
		} catch (error) {
			logger.error({ err: error, reservationId: reservation.id }, '[Event Reminders] Failed to send 1-week reminder');
			failed++;
		}
	}

	// Find reservations needing 1-day reminder
	const oneDayReservations = await db.query.reservations.findMany({
		where: and(
			eq(reservations.status, 'confirmed'),
			eq(reservations.reminderSent1Day, false)
		),
		with: {
			eventSession: {
				with: {
					event: true
				}
			},
			payment: true
		}
	});

	// Filter for sessions starting tomorrow
	const reservationsFor1Day = oneDayReservations.filter((r: typeof oneDayReservations[number]) => {
		const sessionStart = new Date(r.eventSession.startTime);
		return sessionStart >= oneDayFromNow && sessionStart <= endOfOneDayFromNow;
	});

	logger.info(`[Event Reminders] Found ${reservationsFor1Day.length} reservations for 1-day reminder`);

	// Send 1-day reminders
	for (const reservation of reservationsFor1Day) {
		try {
			await sendReminder(reservation, '1day');
			await db.update(reservations)
				.set({ reminderSent1Day: true, updatedAt: new Date() })
				.where(eq(reservations.id, reservation.id));
			sent1Day++;
		} catch (error) {
			logger.error({ err: error, reservationId: reservation.id }, '[Event Reminders] Failed to send 1-day reminder');
			failed++;
		}
	}

	const totalSent = sent1Week + sent1Day;
	logger.info(`[Event Reminders] Job complete: ${totalSent} reminders sent (${sent1Week} 1-week, ${sent1Day} 1-day), ${failed} failed`);

	return {
		processed: totalSent,
		sent1Week,
		sent1Day,
		failed
	};
}

/**
 * Send reminder for a single reservation
 */
async function sendReminder(
	reservation: any,
	type: '1week' | '1day'
): Promise<void> {
	const daysUntil = type === '1week' ? 7 : 1;

	// Send email reminder
	const { sendEventReminderEmail } = await import('../services/email');
	await sendEventReminderEmail({
		reservation: reservation as any,
		session: reservation.eventSession as any,
		event: {
			title: reservation.eventSession.event?.title || 'Event',
			location: reservation.eventSession.event?.location || '',
		},
		guestName: reservation.guestName,
		guestEmail: reservation.guestEmail,
		accessToken: reservation.accessToken,
		daysUntil,
	});

	// Send SMS if phone number exists and preference is not email-only
	if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
		try {
			const { sendEventReminderSMS } = await import('../services/sms');
			await sendEventReminderSMS({
				phone: reservation.guestPhone,
				guestName: reservation.guestName,
				eventTitle: reservation.eventSession.event?.title || 'Event',
				sessionStartTime: reservation.eventSession.startTime,
				accessToken: reservation.accessToken,
				daysUntil,
			});
		} catch (error) {
			logger.error({ err: error }, '[Event Reminders] Failed to send SMS');
			// Don't throw - email might have been sent
		}
	}
}

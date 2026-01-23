import { db } from '../db';
import { reservations, eventSessions } from '../db/schema';
import { logger } from '$lib/server/logger';
import { eq, and, lt, gte, sql } from 'drizzle-orm';
import { queueEmail } from '../jobs/process-email-queue';
import { env } from '../env';
import { escapeHtml } from '$lib/utils/html';
import { formatCurrency } from '$lib/utils/currency';

/**
 * Find reservations that need event reminders
 * - 1 week before: sessions starting 7 days from now (within 1 hour window)
 * - 1 day before: sessions starting 1 day from now (within 1 hour window)
 */
export async function findReservationsNeedingReminders() {
	const now = new Date();
	const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
	const oneWeekWindowEnd = new Date(oneWeekFromNow.getTime() + 60 * 60 * 1000); // +1 hour
	const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
	const oneDayWindowEnd = new Date(oneDayFromNow.getTime() + 60 * 60 * 1000); // +1 hour

	// First get all reservations that need reminders
	const allConfirmedReservations = await db.query.reservations.findMany({
		where: eq(reservations.status, 'confirmed'),
		with: {
			eventSession: {
				with: {
					event: true,
				},
			},
		},
	});

	// Filter for 1-week reminders
	const oneWeekReminders = allConfirmedReservations.filter(r => {
		if (r.reminderSent1Week) return false;
		const sessionTime = new Date(r.eventSession.startTime);
		return sessionTime >= oneWeekFromNow && sessionTime <= oneWeekWindowEnd;
	});

	// Filter for 1-day reminders
	const oneDayReminders = allConfirmedReservations.filter(r => {
		if (r.reminderSent1Day) return false;
		const sessionTime = new Date(r.eventSession.startTime);
		return sessionTime >= oneDayFromNow && sessionTime <= oneDayWindowEnd;
	});

	return {
		oneWeek: oneWeekReminders,
		oneDay: oneDayReminders,
	};
}

/**
 * Generate reminder email text
 */
function generateReminderTextTemplate(
	data: typeof reservations.$inferSelect & {
		eventSession: typeof eventSessions.$inferSelect & { event: { title: string; location: string } };
	},
	daysUntil: number
): string {
	const formattedDate = data.eventSession.startTime.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	const formattedTime = data.eventSession.startTime.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit'
	});

	const timePhrase = daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

	return `
Event Reminder: ${data.eventSession.event.title}

Hi ${data.guestName},

This is a friendly reminder that your event is coming up ${timePhrase}.

${data.eventSession.event.title}
${data.eventSession.title}
${formattedDate} at ${formattedTime}
${data.eventSession.event.location}

Your tickets: ${env.PUBLIC_URL}/tickets/${data.accessToken}

We look forward to seeing you there!

Need help? Just reply to this email.
  `.trim();
}

/**
 * Generate reminder email HTML
 */
function generateReminderHtmlTemplate(
	data: typeof reservations.$inferSelect & {
		eventSession: typeof eventSessions.$inferSelect & { event: { title: string; location: string } };
	},
	daysUntil: number
): string {
	const formattedDate = data.eventSession.startTime.toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	const formattedTime = data.eventSession.startTime.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit'
	});

	const timePhrase = daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event Reminder - ${escapeHtml(data.eventSession.event.title)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; margin-bottom: 24px; text-align: center;">
    <div style="color: #ffffff; font-size: 48px; margin-bottom: 16px;">🔔</div>
    <h1 style="margin: 0 0 8px 0; color: #ffffff; font-size: 28px; font-weight: 700;">Event Reminder</h1>
    <p style="margin: 0; color: #ffffff; opacity: 0.9; font-size: 16px;">Your event is coming up ${timePhrase}!</p>
  </div>

  <!-- Event Details -->
  <div style="background-color: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">Event Details</h2>

    <div style="margin-bottom: 16px;">
      <p style="margin: 0 0 4px 0; color: #6c757d; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Event</p>
      <p style="margin: 0; color: #1a1a1a; font-size: 18px; font-weight: 500;">${escapeHtml(data.eventSession.event.title)}</p>
      <p style="margin: 4px 0 0 0; color: #6c757d; font-size: 14px;">${escapeHtml(data.eventSession.title)}</p>
    </div>

    <div style="margin-bottom: 16px;">
      <p style="margin: 0 0 4px 0; color: #6c757d; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Date & Time</p>
      <p style="margin: 0; color: #1a1a1a; font-size: 16px;">${formattedDate}</p>
      <p style="margin: 4px 0 0 0; color: #6c757d; font-size: 14px;">${formattedTime}</p>
    </div>

    <div style="margin-bottom: 0;">
      <p style="margin: 0 0 4px 0; color: #6c757d; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Location</p>
      <p style="margin: 0; color: #1a1a1a; font-size: 16px;">${escapeHtml(data.eventSession.event.location)}</p>
    </div>
  </div>

  <!-- Ticket Info -->
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0; color: #6c757d; font-size: 14px;">Number of tickets</p>
    <p style="margin: 4px 0 0 0; color: #1a1a1a; font-size: 24px; font-weight: 700;">${data.quantity} ticket(s)</p>
  </div>

  <!-- View Tickets Button -->
  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${env.PUBLIC_URL}/tickets/${data.accessToken}"
       style="display: inline-block; background-color: #1a1a1a; color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
      View Your Tickets
    </a>
  </div>

  <!-- Footer -->
  <div style="border-top: 1px solid #e9ecef; padding-top: 24px; text-align: center;">
    <p style="margin: 0 0 8px 0; color: #6c757d; font-size: 12px;">
      Need help? Just reply to this email.
    </p>
    <p style="margin: 0; color: #adb5bd; font-size: 11px;">
      This is an automated reminder from Germinal.
    </p>
  </div>
</body>
</html>`;
}

/**
 * Send event reminder email
 */
async function sendReminderEmail(
	reservation: typeof reservations.$inferSelect & {
		eventSession: typeof eventSessions.$inferSelect & { event: { title: string; location: string } };
	},
	daysUntil: number
) {
	const textBody = generateReminderTextTemplate(reservation, daysUntil);
	const htmlBody = generateReminderHtmlTemplate(reservation, daysUntil);

	await queueEmail({
		type: 'ticket_confirmation',
		recipient: reservation.guestEmail,
		subject: `Reminder: ${reservation.eventSession.event.title} ${daysUntil === 1 ? 'is tomorrow' : `in ${daysUntil} days`}`,
		textBody,
		htmlBody,
		metadata: {
			reservationId: reservation.id,
			type: 'event_reminder',
			daysUntil,
		},
	});
}

/**
 * Process event reminders
 * Returns counts of reminders sent
 */
export async function processEventReminders() {
	const { oneWeek, oneDay } = await findReservationsNeedingReminders();

	let oneWeekSent = 0;
	let oneDaySent = 0;

	// Process 1-week reminders
	for (const reservation of oneWeek) {
		try {
			// Send email if user prefers email or both
			if (reservation.notificationPreference !== 'sms') {
				await sendReminderEmail(reservation, 7);
			}

			// Send SMS if user prefers SMS or both, and has a phone number
			if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
				const { sendEventReminderSMS } = await import('./sms');
				await sendEventReminderSMS({
					phone: reservation.guestPhone,
					guestName: reservation.guestName,
					eventTitle: reservation.eventSession.event.title,
					sessionStartTime: reservation.eventSession.startTime,
					accessToken: reservation.accessToken,
					daysUntil: 7,
				});
			}

			// Mark as sent
			await db.update(reservations)
				.set({ reminderSent1Week: true })
				.where(eq(reservations.id, reservation.id));

			oneWeekSent++;
			logger.info(`[Reminder] Sent 1-week reminder for reservation ${reservation.id}`);
		} catch (error) {
			logger.error(`[Reminder] Failed to send 1-week reminder for reservation ${reservation.id}:`, error);
		}
	}

	// Process 1-day reminders
	for (const reservation of oneDay) {
		try {
			// Send email if user prefers email or both
			if (reservation.notificationPreference !== 'sms') {
				await sendReminderEmail(reservation, 1);
			}

			// Send SMS if user prefers SMS or both, and has a phone number
			if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
				const { sendEventReminderSMS } = await import('./sms');
				await sendEventReminderSMS({
					phone: reservation.guestPhone,
					guestName: reservation.guestName,
					eventTitle: reservation.eventSession.event.title,
					sessionStartTime: reservation.eventSession.startTime,
					accessToken: reservation.accessToken,
					daysUntil: 1,
				});
			}

			// Mark as sent
			await db.update(reservations)
				.set({ reminderSent1Day: true })
				.where(eq(reservations.id, reservation.id));

			oneDaySent++;
			logger.info(`[Reminder] Sent 1-day reminder for reservation ${reservation.id}`);
		} catch (error) {
			logger.error(`[Reminder] Failed to send 1-day reminder for reservation ${reservation.id}:`, error);
		}
	}

	return {
		oneWeekSent,
		oneDaySent,
		total: oneWeekSent + oneDaySent,
	};
}

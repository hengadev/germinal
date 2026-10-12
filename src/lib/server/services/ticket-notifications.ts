import { logger } from '$lib/server/logger';
import type { Reservation } from '$lib/types/reservations';
import type { eventSessions } from '../db/schema';
import { sendTicketConfirmationEmail } from './email';

/**
 * Send a confirmed Reservation's Ticket to its Guest: the confirmation email
 * (QR code, calendar links) and, if they opted in and gave a phone number,
 * the confirmation SMS.
 *
 * Shared by every path that confirms a Guest's booking — the Stripe webhooks
 * (handleCheckoutSuccess / handlePaymentSuccess) and a booking with no
 * Deposit, confirmed without Stripe (issue 025). Call it only after the
 * confirmation has been committed. It never throws: a failed send is logged
 * and the booking stands — the Ticket stays reachable via its access token.
 */
export async function sendTicketNotifications(
	reservation: Reservation & {
		eventSession: typeof eventSessions.$inferSelect & {
			event: { titleEn: string; titleFr: string; slug: string; locationEn: string };
		};
	}
): Promise<void> {
	try {
		await sendTicketConfirmationEmail({
			guestEmail: reservation.guestEmail,
			guestName: reservation.guestName,
			accessToken: reservation.accessToken,
			reservation,
			session: reservation.eventSession,
			event: reservation.eventSession.event,
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to send ticket confirmation email');
	}

	if (reservation.guestPhone && reservation.notificationPreference !== 'email') {
		try {
			const { sendTicketConfirmationSMS } = await import('./sms');
			await sendTicketConfirmationSMS({
				phone: reservation.guestPhone,
				guestName: reservation.guestName,
				eventTitle: reservation.eventSession.event.titleEn,
				sessionStartTime: reservation.eventSession.startTime,
				accessToken: reservation.accessToken,
			});
		} catch (error) {
			logger.error({ err: error }, 'Failed to send ticket confirmation SMS');
		}
	}
}

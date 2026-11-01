import { db } from '../db';
import { logger } from '$lib/server/logger';
import { events, eventDays, eventServices, eventSessions, reservations } from '../db/schema';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { isInThankYouSendWindow } from '$lib/utils/thank-you-window';

interface ThankYouResult {
	processed: number;
	sent: number;
	failed: number;
}

/**
 * Post-event Thank-you (issue 054): for each Day of an Event with the
 * Thank-you on, once the morning send window has opened (10:00 on the
 * Event's clock, and never for a Day ended more than 3 days ago), queue
 * the email to every confirmed, checked-in Reservation with an email
 * that has not been thanked yet. Each Reservation is thanked at most
 * once: the send stamps `thankYouSentAt`, and only rows still unstamped
 * are ever selected.
 */
export async function sendThankYouEmails(now: Date = new Date()): Promise<ThankYouResult> {
	logger.info('[Thank You] Starting thank-you job...');

	const thankedEvents = await db
		.select({
			eventId: events.id,
			timeZone: events.timeZone,
			titleEn: events.titleEn,
			titleFr: events.titleFr,
			thankYouMessageEn: events.thankYouMessageEn,
			thankYouMessageFr: events.thankYouMessageFr,
			thankYouLinkUrl: events.thankYouLinkUrl,
			thankYouLinkLabelEn: events.thankYouLinkLabelEn,
			thankYouLinkLabelFr: events.thankYouLinkLabelFr,
			dayDate: eventDays.date,
			dayId: eventDays.id,
		})
		.from(events)
		.innerJoin(eventDays, eq(eventDays.eventId, events.id))
		.where(eq(events.thankYouEnabled, true));

	// Only the Days whose send window is open this hour.
	const due = thankedEvents.filter((row: (typeof thankedEvents)[number]) =>
		isInThankYouSendWindow(row.dayDate, row.timeZone, now));

	let sent = 0;
	let failed = 0;

	for (const day of due) {
		const guests = await db
			.select({
				id: reservations.id,
				guestEmail: reservations.guestEmail,
				guestName: reservations.guestName,
				locale: reservations.locale,
			})
			.from(reservations)
			.innerJoin(eventSessions, eq(eventSessions.id, reservations.eventSessionId))
			.innerJoin(eventServices, eq(eventServices.id, eventSessions.serviceId))
			.where(and(
				eq(eventServices.dayId, day.dayId),
				eq(reservations.status, 'confirmed'),
				isNotNull(reservations.guestEmail),
				isNull(reservations.thankYouSentAt),
				// At least one Check-in that was not undone.
				sql`EXISTS (
					SELECT 1 FROM check_ins ci
					WHERE ci.reservation_id = ${reservations.id} AND ci.undone_at IS NULL
				)`
			));

		for (const guest of guests) {
			try {
				const lang = guest.locale === 'fr' ? 'fr' : 'en';
				// Language fallback (issue 054): an empty message or label
				// falls back to the other language.
				const message = (lang === 'fr'
					? day.thankYouMessageFr || day.thankYouMessageEn
					: day.thankYouMessageEn || day.thankYouMessageFr) ?? '';
				const linkLabel = day.thankYouLinkUrl
					? ((lang === 'fr'
						? day.thankYouLinkLabelFr || day.thankYouLinkLabelEn
						: day.thankYouLinkLabelEn || day.thankYouLinkLabelFr) ?? null)
					: null;
				const eventTitle = (lang === 'fr'
					? day.titleFr || day.titleEn
					: day.titleEn || day.titleFr) ?? '';

				// Claim the send first: only a row still unstamped is stamped,
				// so a concurrent run cannot thank the same Guest twice.
				const claimed = await db.update(reservations)
					.set({ thankYouSentAt: now, updatedAt: new Date() })
					.where(and(eq(reservations.id, guest.id), isNull(reservations.thankYouSentAt)))
					.returning({ id: reservations.id });
				if (claimed.length === 0) continue;

				const { sendThankYouEmail } = await import('../services/email');
				await sendThankYouEmail({
					guestEmail: guest.guestEmail,
					guestName: guest.guestName,
					eventTitle,
					message,
					linkUrl: day.thankYouLinkUrl,
					linkLabel,
					reservationId: guest.id,
					locale: lang,
				});
				sent++;
			} catch (error) {
				// Release the claim, so the next hourly run tries again.
				await db.update(reservations)
					.set({ thankYouSentAt: null })
					.where(eq(reservations.id, guest.id))
					.catch(() => {});
				logger.error({ err: error, reservationId: guest.id }, '[Thank You] Failed to send thank-you email');
				failed++;
			}
		}
	}

	logger.info(`[Thank You] Job complete: ${sent} thank-you emails sent, ${failed} failed`);
	return { processed: sent + failed, sent, failed };
}

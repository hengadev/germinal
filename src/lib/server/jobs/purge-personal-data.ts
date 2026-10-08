import { db } from '../db';
import { contactSubmissions, emailQueue, eventSessions, reservations, waitlist } from '../db/schema';
import { and, eq, inArray, isNotNull, lt, ne, or } from 'drizzle-orm';
import { jobLogger } from '../logger';

/**
 * GDPR retention: personal data is kept only as long as the privacy page
 * (legal/privacy, "Durées de conservation") says. Amounts, dates, statuses and
 * Stripe IDs stay, so revenue figures and the payment trail survive; the
 * accounting archive itself is the e-invoicing platform's job, not the app's.
 *
 * Time-based and idempotent: after a backup restore, the next run (or one by
 * hand) removes again whatever the restore brought back.
 */
export const RETENTION = {
	/** Guest identity on a reservation, counted from the session's end. */
	reservationAfterSessionDays: 365,
	/** A reservation that was never paid (status expired), from its expiry. */
	abandonedReservationDays: 30,
	/** IP address and user agent (fraud prevention), from creation. */
	technicalDataDays: 365,
	/** Waitlist entries, from the session's end. */
	waitlistAfterSessionDays: 30,
	/** Contact form messages, from receipt. */
	contactSubmissionDays: 365,
	/** Sent or failed emails (they hold names and ticket links), from creation. */
	emailQueueDays: 30,
} as const;

/** Replaces the guest's email; the column is NOT NULL. */
export const ANONYMISED_EMAIL = 'anonymised@invalid';
export const ANONYMISED_NAME = 'Anonymised';

export interface PurgePersonalDataResult {
	reservationsAnonymised: number;
	technicalDataCleared: number;
	waitlistDeleted: number;
	contactSubmissionsDeleted: number;
	emailsDeleted: number;
}

function daysAgo(days: number, now: Date): Date {
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function purgePersonalData(now: Date = new Date()): Promise<PurgePersonalDataResult> {
	const endedSessions = (days: number) =>
		db
			.select({ id: eventSessions.id })
			.from(eventSessions)
			.where(lt(eventSessions.endTime, daysAgo(days, now)));

	const anonymised = await db
		.update(reservations)
		.set({
			guestEmail: ANONYMISED_EMAIL,
			guestName: ANONYMISED_NAME,
			guestPhone: null,
			ipAddress: null,
			userAgent: null,
			updatedAt: now,
		})
		.where(
			and(
				ne(reservations.guestEmail, ANONYMISED_EMAIL),
				or(
					inArray(reservations.eventSessionId, endedSessions(RETENTION.reservationAfterSessionDays)),
					and(
						eq(reservations.status, 'expired'),
						lt(reservations.expiresAt, daysAgo(RETENTION.abandonedReservationDays, now))
					)
				)
			)
		)
		.returning({ id: reservations.id });

	const technical = await db
		.update(reservations)
		.set({ ipAddress: null, userAgent: null })
		.where(
			and(
				lt(reservations.createdAt, daysAgo(RETENTION.technicalDataDays, now)),
				or(isNotNull(reservations.ipAddress), isNotNull(reservations.userAgent))
			)
		)
		.returning({ id: reservations.id });

	const waitlistRows = await db
		.delete(waitlist)
		.where(inArray(waitlist.eventSessionId, endedSessions(RETENTION.waitlistAfterSessionDays)))
		.returning({ id: waitlist.id });

	const contacts = await db
		.delete(contactSubmissions)
		.where(lt(contactSubmissions.createdAt, daysAgo(RETENTION.contactSubmissionDays, now)))
		.returning({ id: contactSubmissions.id });

	const emails = await db
		.delete(emailQueue)
		.where(
			and(
				inArray(emailQueue.status, ['sent', 'failed']),
				lt(emailQueue.createdAt, daysAgo(RETENTION.emailQueueDays, now))
			)
		)
		.returning({ id: emailQueue.id });

	const result = {
		reservationsAnonymised: anonymised.length,
		technicalDataCleared: technical.length,
		waitlistDeleted: waitlistRows.length,
		contactSubmissionsDeleted: contacts.length,
		emailsDeleted: emails.length,
	};
	jobLogger.info(result, '[Purge Job] Personal data retention applied');
	return result;
}

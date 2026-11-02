/**
 * Issue 055 — Erase a Guest's data, an RGPD erasure request answered by an
 * Admin from the Guest's « Clients » page. Everything happens in one
 * transaction: every Reservation with that normalised email is anonymised
 * with the same values as the retention purge (issue 052's job), the
 * Dietary Requirements and their consent are cleared, and the notes-and-
 * tags row, the subscriber row and the waitlist entries are deleted.
 * Amounts, dates, statuses and Stripe ids stay for accounting.
 */
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventSessions, guestNotes, reservations, subscribers, waitlist } from '../db/schema';
import { ANONYMISED_EMAIL, ANONYMISED_NAME } from '../jobs/purge-personal-data';

export interface EraseGuestResult {
	ok: boolean;
	error?: string;
	/** Counts for the audit entry: never the email. */
	counts?: {
		reservationsAnonymised: number;
		notesDeleted: number;
		subscribersDeleted: number;
		waitlistDeleted: number;
	};
}

/**
 * Refused while the email has a confirmed Reservation on a Seating that
 * hasn't ended: the Restaurant still needs the Guest's identity to seat
 * them (and find them a no-show).
 */
export async function eraseGuest(rawEmail: string, now: Date = new Date()): Promise<EraseGuestResult> {
	const email = rawEmail.trim().toLowerCase();

	return db.transaction(async (tx: typeof db) => {
		const [upcoming] = await tx
			.select({ id: reservations.id })
			.from(reservations)
			.innerJoin(eventSessions, eq(eventSessions.id, reservations.eventSessionId))
			.where(
				and(
					eq(reservations.status, 'confirmed'),
					gt(eventSessions.endTime, now),
					sql`lower(btrim(${reservations.guestEmail})) = ${email}`
				)
			)
			.limit(1);
		if (upcoming) {
			return {
				ok: false,
				error:
					'Impossible : ce client a une réservation confirmée sur une séance à venir. ' +
					'Attendez la fin de la séance avant d\u2019effacer ses données.'
			};
		}

		const matchEmail = sql`lower(btrim(${reservations.guestEmail})) = ${email}`;

		const anonymised = await tx
			.update(reservations)
			.set({
				guestEmail: ANONYMISED_EMAIL,
				guestName: ANONYMISED_NAME,
				guestPhone: null,
				ipAddress: null,
				userAgent: null,
				dietaryRequirements: null,
				dietaryConsentAt: null,
				updatedAt: now
			})
			.where(matchEmail)
			.returning({ id: reservations.id });

		const notes = await tx.delete(guestNotes).where(eq(guestNotes.email, email)).returning({
			email: guestNotes.email
		});

		const subs = await tx.delete(subscribers).where(eq(subscribers.email, email)).returning({
			id: subscribers.id
		});

		const entries = await tx
			.delete(waitlist)
			.where(sql`lower(btrim(${waitlist.email})) = ${email}`)
			.returning({ id: waitlist.id });

		return {
			ok: true,
			counts: {
				reservationsAnonymised: anonymised.length,
				notesDeleted: notes.length,
				subscribersDeleted: subs.length,
				waitlistDeleted: entries.length
			}
		};
	});
}

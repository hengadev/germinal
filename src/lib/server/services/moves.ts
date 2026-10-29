/**
 * Moves (issue 022): Staff move a Reservation to another Seating of the
 * same Service on the same Day — same menu, same price, so nothing paid
 * or owed changes. The Reservation keeps its access Token (the Ticket
 * still works), its Check-ins and its Balance; only the Seating changes,
 * and the Move is attributed to who made it and when. Any other Seating
 * (another Service, another Day) is refused: that is Admin work.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, events, reservations } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import { recordAuditLog } from './audit-log';
import { lockAndDecrementSeatingAllowingOverflow } from './reservations';
import { restoreCapacity } from './reservation-transitions';
import { sendReservationModifiedEmail } from './email';
import { logger } from '$lib/server/logger';
export type MoveResult = { ok: true } | { ok: false; error: string };

/**
 * Move a confirmed Reservation to another Seating of its Service on the
 * Day under way, releasing the old Seating's capacity and taking the new
 * one's under the same row locks as bookings. Refused with a French
 * message when the actor lacks the Move permission, the Reservation
 * isn't confirmed or isn't on the Day under way, or the target Seating
 * is of another Service or another Day.
 */
export async function moveReservation(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	toSeatingId: string;
	actorId: string;
	now?: Date;
}): Promise<MoveResult> {
	const { access, eventId, reservationId, toSeatingId, actorId } = input;
	const now = input.now ?? new Date();

	if (!access.can('move')) {
		return { ok: false, error: "Vous n'avez pas la permission de déplacer une réservation." };
	}

	// Email data filled inside the transaction, sent only once it commits:
	// a send failure must not fail the Move.
	let email: Parameters<typeof sendReservationModifiedEmail>[0] | null = null;

	const result = await db.transaction(async (tx: typeof db) => {
		// Lock the Reservation's row so two simultaneous Moves cannot
		// interleave.
		const [party] = await tx
			.select({
				status: reservations.status,
				quantity: reservations.quantity,
				guestEmail: reservations.guestEmail,
				guestName: reservations.guestName,
				accessToken: reservations.accessToken,
				currentSeatingId: eventSessions.id,
				currentServiceId: eventServices.id,
				eventId: eventSessions.eventId,
				day: eventDays.date,
			})
			.from(reservations)
			.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
			.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(reservations.id, reservationId))
			.for('update', { of: reservations });

		if (!party || party.eventId !== eventId) {
			return { ok: false as const, error: 'Réservation introuvable.' };
		}
		if (party.status !== 'confirmed') {
			return { ok: false as const, error: 'Cette réservation n’est pas confirmée.' };
		}
		if (access.day === null || String(party.day) !== access.day) {
			return {
				ok: false as const,
				error: "Cette réservation n'est pas pour le jour en cours.",
			};
		}
		if (toSeatingId === party.currentSeatingId) {
			return {
				ok: false as const,
				error: 'La réservation est déjà sur cette séance.',
			};
		}

		// The target Seating must be of the SAME Service on the SAME Day.
		const [target] = await tx
			.select({
				serviceId: eventServices.id,
				day: eventDays.date,
				eventId: eventSessions.eventId,
				timeZone: events.timeZone,
				eventTitleEn: events.titleEn,
				eventTitleFr: events.titleFr,
				titleFr: eventSessions.titleFr,
				titleEn: eventSessions.titleEn,
			})
			.from(eventSessions)
			.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.innerJoin(events, eq(eventSessions.eventId, events.id))
			.where(eq(eventSessions.id, toSeatingId));

		if (
			!target ||
			target.eventId !== eventId ||
			target.serviceId !== party.currentServiceId ||
			String(target.day) !== access.day
		) {
			return {
				ok: false as const,
				error: 'Cette séance ne fait pas partie du même service du jour en cours.',
			};
		}

		// Lock both Seating rows in a consistent order (by id) so two Moves
		// in opposite directions cannot deadlock.
		const [firstId, secondId] = [party.currentSeatingId, toSeatingId].sort();
		await tx
			.select({ id: eventSessions.id })
			.from(eventSessions)
			.where(eq(eventSessions.id, firstId))
			.for('update');
		await tx
			.select({ id: eventSessions.id })
			.from(eventSessions)
			.where(eq(eventSessions.id, secondId))
			.for('update');

		// Release on the old Seating, take on the new one: the new Seating
		// may be exceeded, with the counter floored at 0 as for Walk-ins.
		await restoreCapacity(tx, party.currentSeatingId, party.quantity);
		await lockAndDecrementSeatingAllowingOverflow(tx, toSeatingId, party.quantity);

		await tx
			.update(reservations)
			.set({ eventSessionId: toSeatingId, lastMovedAt: now, lastMovedBy: actorId, updatedAt: now })
			.where(eq(reservations.id, reservationId));

		await recordAuditLog({
			adminId: actorId,
			action: 'reservation.moved',
			entityType: 'reservation',
			entityId: reservationId,
			metadata: {
				reservationId,
				fromSeatingId: party.currentSeatingId,
				toSeatingId,
				quantity: party.quantity,
			},
		});

		const [seating] = await tx
			.select({ startTime: eventSessions.startTime })
			.from(eventSessions)
			.where(eq(eventSessions.id, toSeatingId));

		email = {
			guestEmail: party.guestEmail,
			guestName: party.guestName ?? '',
			eventTitle: target.eventTitleEn || target.eventTitleFr || '',
			sessionTitle: target.titleEn || target.titleFr || '',
			sessionStartTime: seating.startTime,
			timeZone: target.timeZone,
			reservationId,
			accessToken: party.accessToken,
		};

		return { ok: true as const };
	});

	if (!result.ok) return result;

	if (email?.guestEmail) {
		try {
			await sendReservationModifiedEmail(email);
		} catch (err) {
			// The Move itself is done and durable: only the notification
			// failed, and that must not fail the Move.
			logger.error({ err, reservationId }, 'Failed to send the modified reservation email');
		}
	}
	return { ok: true };
}

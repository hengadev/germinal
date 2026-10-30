/**
 * Comps made on the spot (issue 021): a Comp (see CONTEXT.md) offered by a
 * trusted Staff member on the day. Like a Walk-in it reuses issue 020's
 * creation path, but the Reservation is a Comp: it owes nothing (no
 * Balance), sends no Ticket, and is attributed to whoever made it.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { checkIns, eventDays, eventServices, eventSessions } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import { createStaffReservation } from './reservations';
import { recordAuditLog } from './audit-log';
import { spotPartyError } from './walk-ins';

export type CompResult = { ok: true; reservationId: string } | { ok: false; error: string };

/**
 * Offer a Comp on the spot: create the Reservation (isComp, origin 'staff',
 * attributed to the actor) and its whole-party Check-in in one transaction.
 * The Seating must belong to the Event and to the Day the actor works; one
 * that has already started is allowed. Refused with a French message when
 * the actor lacks the "offer a Comp" permission.
 */
export async function createCompOnTheSpot(input: {
	access: StaffAccess;
	eventId: string;
	seatingId: string;
	name: string;
	quantity: number;
	email?: string;
	phone?: string;
	actorId: string;
}): Promise<CompResult> {
	const { access, eventId, seatingId, name, quantity, email, phone, actorId } = input;

	if (!access.can('comp')) {
		return { ok: false, error: "Vous n'avez pas la permission d'offrir un comp." };
	}
	const invalid = spotPartyError({ name, quantity, email, phone });
	if (invalid) return { ok: false, error: invalid };

	return db.transaction(async (tx: typeof db) => {
		const [seating] = await tx
			.select({ eventId: eventSessions.eventId, day: eventDays.date })
			.from(eventSessions)
			.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventSessions.id, seatingId));

		if (!seating || seating.eventId !== eventId) {
			return { ok: false as const, error: 'Séance introuvable.' };
		}
		if (access.day === null || String(seating.day) !== access.day) {
			return { ok: false as const, error: "Cette séance n'est pas pour le jour en cours." };
		}

		const { reservation } = await createStaffReservation(
			{ kind: 'comp', sessionId: seatingId, name: name.trim(), quantity, email, phone, actorId },
			tx
		);

		// The whole party is by definition at the door: checked in as one,
		// by hand, in the same transaction as the Reservation.
		const [checkIn] = await tx
			.insert(checkIns)
			.values({ reservationId: reservation.id, guests: quantity, method: 'manual', checkedInBy: actorId })
			.returning({ id: checkIns.id });

		await recordAuditLog({
			adminId: actorId,
			action: 'comp.create',
			entityType: 'reservation',
			entityId: reservation.id,
			metadata: { seatingId, quantity, checkInId: checkIn.id },
		});

		return { ok: true as const, reservationId: reservation.id };
	});
}

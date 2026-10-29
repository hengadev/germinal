/**
 * Walk-ins (issue 020): a party that turns up without booking, seated and
 * recorded on the spot. The Reservation is confirmed at once, owes its full
 * price as its Balance, and a Check-in for the whole party is recorded in
 * the same transaction — the party is by definition already at the door.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { checkIns, eventDays, eventServices, eventSessions } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import { createStaffReservation } from './reservations';
import { recordAuditLog } from './audit-log';

export type WalkInResult = { ok: true; reservationId: string } | { ok: false; error: string };

/**
 * Seat a Walk-in: create the Reservation (origin 'walk_in', attributed to
 * the actor) and its whole-party Check-in in one transaction. The Seating
 * must belong to the Event and to the Day the actor works; one that has
 * already started is allowed. Refused with a French message when the actor
 * lacks the Walk-in permission.
 */
export async function createWalkIn(input: {
	access: StaffAccess;
	eventId: string;
	seatingId: string;
	name: string;
	quantity: number;
	email?: string;
	phone?: string;
	actorId: string;
}): Promise<WalkInResult> {
	const { access, eventId, seatingId, name, quantity, email, phone, actorId } = input;

	if (!access.can('walk_in')) {
		return { ok: false, error: "Vous n'avez pas la permission d'ajouter un walk-in." };
	}
	if (name.trim() === '') {
		return { ok: false, error: 'Le nom est obligatoire.' };
	}
	if (!Number.isInteger(quantity) || quantity < 1) {
		return { ok: false, error: 'Le nombre de personnes doit être au moins 1.' };
	}

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
			{ kind: 'walk_in', sessionId: seatingId, name: name.trim(), quantity, email, phone, actorId },
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
			action: 'walk_in.create',
			entityType: 'reservation',
			entityId: reservation.id,
			metadata: { seatingId, quantity, checkInId: checkIn.id },
		});

		return { ok: true as const, reservationId: reservation.id };
	});
}

/**
 * Balance settlement (issue 019): Staff mark a party's Balance as settled
 * once it has been collected on the venue's terminal. Settling records
 * who and when only — no amount, no payment method: the terminal's own
 * report is the accounting for money taken on site. Every change is
 * checked against Staff access on the server, and safe under concurrency:
 * the Reservation's row is locked before it is read.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, reservations } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import { recordAuditLog } from './audit-log';

export type BalanceResult = { ok: true } | { ok: false; error: string };

/**
 * Mark a Reservation's Balance as settled, attributed to the actor.
 * Refuses it, with a French message, when the actor lacks the permission,
 * the Reservation isn't confirmed, belongs to another Event or another
 * Day than the one under way, has no Balance due, or is already settled.
 */
export async function settleBalance(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	actorId: string;
}): Promise<BalanceResult> {
	const { access, eventId, reservationId, actorId } = input;

	if (!access.can('settle_balance')) {
		return { ok: false, error: "Vous n'avez pas la permission de régler un solde." };
	}

	return db.transaction(async (tx: typeof db) => {
		// Lock the Reservation's row so two simultaneous settlements or an
		// undo cannot interleave.
		const [party] = await tx
			.select({
				status: reservations.status,
				isComp: reservations.isComp,
				balanceAmount: reservations.balanceAmount,
				balanceSettledAt: reservations.balanceSettledAt,
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
		if (party.isComp || party.balanceAmount <= 0) {
			return {
				ok: false as const,
				error: 'Cette réservation n’a pas de solde à régler.',
			};
		}
		if (party.balanceSettledAt !== null) {
			return { ok: false as const, error: 'Le solde de cette réservation est déjà réglé.' };
		}

		// Who and when only: no amount, no payment method anywhere.
		await tx
			.update(reservations)
			.set({ balanceSettledAt: new Date(), balanceSettledBy: actorId, updatedAt: new Date() })
			.where(eq(reservations.id, reservationId));

		await recordAuditLog({
			adminId: actorId,
			action: 'reservation.balance_settled',
			entityType: 'reservation',
			entityId: reservationId,
			metadata: { reservationId },
		});

		return { ok: true as const };
	});
}

/**
 * Undo a settlement: both fields are cleared. Requires the "correct a
 * mistake" permission (Admins hold every permission).
 */
export async function undoSettleBalance(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	actorId: string;
}): Promise<BalanceResult> {
	const { access, eventId, reservationId, actorId } = input;

	if (!access.can('correct_mistake')) {
		return { ok: false, error: "Vous n'avez pas la permission de corriger une erreur." };
	}

	return db.transaction(async (tx: typeof db) => {
		const [party] = await tx
			.select({ eventId: eventSessions.eventId, balanceSettledAt: reservations.balanceSettledAt })
			.from(reservations)
			.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
			.where(eq(reservations.id, reservationId))
			.for('update', { of: reservations });

		if (!party || party.eventId !== eventId) {
			return { ok: false as const, error: 'Réservation introuvable.' };
		}
		if (party.balanceSettledAt === null) {
			return { ok: false as const, error: 'Le solde de cette réservation n’est pas réglé.' };
		}

		await tx
			.update(reservations)
			.set({ balanceSettledAt: null, balanceSettledBy: null, updatedAt: new Date() })
			.where(eq(reservations.id, reservationId));

		await recordAuditLog({
			adminId: actorId,
			action: 'reservation.balance_settled_undo',
			entityType: 'reservation',
			entityId: reservationId,
			metadata: { reservationId },
		});

		return { ok: true as const };
	});
}

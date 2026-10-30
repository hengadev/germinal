/**
 * Check-ins (issue 017): the record that some of a Reservation's Guests
 * arrived, how many, by hand or by scan, and who recorded it. Every
 * change is checked against Staff access on the server, and safe under
 * concurrency: the Reservation's row is locked before the parties still
 * expected are counted, so two simultaneous Check-ins never add up to
 * more than the party size. Undoing keeps the row, marked undone.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { checkIns, eventDays, eventServices, eventSessions, reservations, users } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import { recordAuditLog } from './audit-log';

export type CheckInResult =
	| { ok: true; arrived: number; quantity: number }
	| { ok: false; error: string };

/**
 * Record a Check-in for `guests` of a Reservation, attributed to the
 * actor. Refuses it, with a French message, when the actor lacks the
 * permission, the Reservation isn't confirmed, it belongs to another
 * Event or another Day than the one under way, or more Guests arrive
 * than are still expected.
 */
export async function recordCheckIn(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	guests: number;
	method: 'scan' | 'manual';
	actorId: string;
}): Promise<CheckInResult> {
	const { access, eventId, reservationId, guests, method, actorId } = input;

	if (method === 'manual' && !access.can('manual_check_in')) {
		return { ok: false, error: "Vous n'avez pas la permission de faire entrer à la main." };
	}
	if (method === 'scan' && !access.can('scan_check_in')) {
		return { ok: false, error: "Vous n'avez pas la permission de faire entrer par scan." };
	}
	if (!Number.isInteger(guests) || guests < 1) {
		return { ok: false, error: 'Le nombre de personnes doit être au moins 1.' };
	}

	return db.transaction(async (tx: typeof db) => {
		// Lock the Reservation's row so the count of Guests still expected
		// is the one this Check-in is checked against.
		const [party] = await tx
			.select({
				quantity: reservations.quantity,
				status: reservations.status,
				eventId: eventSessions.eventId,
				day: eventDays.date,
			})
			.from(reservations)
			.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
			.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(reservations.id, reservationId))
			// Only the Reservation's row: locking the joined Seating would queue
			// every Check-in and online booking of that Seating behind this one.
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

		const [{ arrived }] = await tx
			.select({ arrived: sql<number>`coalesce(sum(${checkIns.guests}), 0)::int` })
			.from(checkIns)
			.where(and(eq(checkIns.reservationId, reservationId), isNull(checkIns.undoneAt)));

		if (arrived + guests > party.quantity) {
			return {
				ok: false as const,
				error: `Il ne reste que ${party.quantity - arrived} personne${party.quantity - arrived === 1 ? '' : 's'} attendue${party.quantity - arrived === 1 ? '' : 's'}.`,
			};
		}

		const [row] = await tx
			.insert(checkIns)
			.values({ reservationId, guests, method, checkedInBy: actorId })
			.returning({ id: checkIns.id });

		await recordAuditLog({
			adminId: actorId,
			action: 'check_in.create',
			entityType: 'check_in',
			entityId: row.id,
			metadata: { reservationId, guests, method },
		});

		return { ok: true as const, arrived: arrived + guests, quantity: party.quantity };
	});
}

/**
 * Guests already arrived (non-undone Check-ins) per Reservation, for the
 * admin lists and the CSV export (issue 023).
 */
export async function arrivedByReservation(
	reservationIds: string[]
): Promise<Map<string, number>> {
	if (reservationIds.length === 0) return new Map();
	const rows: { reservationId: string; arrived: number }[] = await db
		.select({
			reservationId: checkIns.reservationId,
			arrived: sql<number>`coalesce(sum(${checkIns.guests}), 0)::int`,
		})
		.from(checkIns)
		.where(and(inArray(checkIns.reservationId, reservationIds), isNull(checkIns.undoneAt)))
		.groupBy(checkIns.reservationId);
	return new Map(rows.map((r: { reservationId: string; arrived: number }) => [r.reservationId, r.arrived]));
}

export interface CheckInHistoryRow {
	id: string;
	guests: number;
	method: 'scan' | 'manual';
	/** "Prénom Nom" of whoever recorded it, or null if the account is gone. */
	checkedInByName: string | null;
	checkedInAt: Date;
	undoneAt: Date | null;
	undoneByName: string | null;
}

/**
 * The Reservation's full Check-in history, undone ones included, for the
 * admin Reservation page (issue 023). The who is kept even when the
 * account has since been deleted (the record of the evening stays).
 */
export async function checkInHistory(reservationId: string): Promise<CheckInHistoryRow[]> {
	const checker = alias(users, 'checker');
	const undoner = alias(users, 'undoner');
	const rows = await db
		.select({
			id: checkIns.id,
			guests: checkIns.guests,
			method: checkIns.method,
			checkedInByName: sql<string | null>`(${checker.firstName} || ' ' || ${checker.lastName})`,
			checkedInAt: checkIns.checkedInAt,
			undoneAt: checkIns.undoneAt,
			undoneByName: sql<string | null>`(${undoner.firstName} || ' ' || ${undoner.lastName})`,
		})
		.from(checkIns)
		.leftJoin(checker, eq(checkIns.checkedInBy, checker.id))
		.leftJoin(undoner, eq(checkIns.undoneBy, undoner.id))
		.where(eq(checkIns.reservationId, reservationId))
		.orderBy(desc(checkIns.checkedInAt));
	return rows;
}

/**
 * Undo the last Check-in of a Reservation: the row is kept, marked with
 * who undid it and when. Requires the "correct a mistake" permission
 * (Admins hold every permission).
 */
export async function undoLastCheckIn(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const { access, eventId, reservationId, actorId } = input;

	if (!access.can('correct_mistake')) {
		return { ok: false, error: "Vous n'avez pas la permission de corriger une erreur." };
	}

	return db.transaction(async (tx: typeof db) => {
		// Lock the Reservation's row so two undos cannot pick the same Check-in.
		const [party] = await tx
			.select({ eventId: eventSessions.eventId })
			.from(reservations)
			.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
			.where(eq(reservations.id, reservationId))
			// Only the Reservation's row: locking the joined Seating would queue
			// every Check-in and online booking of that Seating behind this one.
			.for('update', { of: reservations });

		if (!party || party.eventId !== eventId) {
			return { ok: false as const, error: 'Réservation introuvable.' };
		}

		const [last] = await tx
			.select({ id: checkIns.id })
			.from(checkIns)
			.where(and(eq(checkIns.reservationId, reservationId), isNull(checkIns.undoneAt)))
			.orderBy(desc(checkIns.checkedInAt), desc(checkIns.id))
			.limit(1)
			.for('update');

		if (!last) {
			return { ok: false as const, error: "Aucune arrivée à annuler pour cette réservation." };
		}

		const now = new Date();
		await tx
			.update(checkIns)
			.set({ undoneAt: now, undoneBy: actorId })
			.where(and(eq(checkIns.id, last.id), isNull(checkIns.undoneAt)));

		await recordAuditLog({
			adminId: actorId,
			action: 'check_in.undo',
			entityType: 'check_in',
			entityId: last.id,
			metadata: { reservationId },
		});

		return { ok: true as const };
	});
}

/**
 * Cancel a party's Reservation, or refund part of what was paid, from the
 * Staff portal (issue 041) — the Arrivées card's ⋮ menu. The same rules as
 * the admin back office (`cancelWithRefund`, `processRefund`), behind the
 * `cancel_refund` permission, and only for a Reservation of this Event's
 * current Day. Also carries the refund figures each party card shows
 * (what was paid online, what remains refundable, the policy's suggestion).
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, events, payments, reservations } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import type { DayGuestList } from './day-guest-list';
import { CancellationError, cancelWithRefund } from './cancellation';
import { processRefund } from './reservations';
import { recordAuditLog } from './audit-log';
import { refundPolicyOf } from '$lib/utils/refund-policy';
import {
	cancellationPreFill,
	refundableAmount,
	type CancelledBy,
} from '$lib/utils/cancellation-refund';
import { formatCurrency } from '$lib/utils/currency';
import { logger } from '../logger';

export type PartyActionResult = { ok: true; message: string } | { ok: false; error: string };

/** The permission both actions need, re-resolved server-side. */
function refusal(access: StaffAccess): string | null {
	if (!access.can('cancel_refund')) {
		return "Vous n'avez pas la permission d'annuler ou de rembourser une réservation.";
	}
	return null;
}

/** The Reservation's currency when it belongs to this Event's current Day (null: it doesn't). */
export async function currentDayReservation(
	access: StaffAccess,
	eventId: string,
	reservationId: string
): Promise<string | null> {
	const [row] = await db
		.select({ rowEventId: eventSessions.eventId, day: eventDays.date, currency: reservations.currency })
		.from(reservations)
		.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(eq(reservations.id, reservationId))
		.limit(1);
	if (!row || row.rowEventId !== eventId) return null;
	return access.day !== null && String(row.day) === access.day ? row.currency : null;
}

/** processRefund's English messages, in French for the Staff member. */
function refundErrorMessage(err: unknown): string {
	const message = err instanceof Error ? err.message : '';
	if (/greater than zero/.test(message)) return 'Le montant à rembourser doit être supérieur à 0';
	if (/exceeds the remaining/.test(message)) return 'Le montant à rembourser dépasse le montant remboursable';
	if (/already been fully refunded/.test(message)) return 'Le paiement a déjà été entièrement remboursé';
	if (/Payment not found/.test(message)) return 'Aucun paiement en ligne pour cette réservation';
	if (/Can only refund/.test(message)) return 'Ce paiement ne peut pas être remboursé';
	if (/already cancelled/.test(message)) return 'Cette réservation est déjà annulée';
	return 'Échec du remboursement';
}

/**
 * Cancel a party's Reservation with the confirmed refund — the admin
 * `cancel` action's logic: `cancelledBy` guest with an amount in minor
 * units (0 allowed), or germinal for the whole refundable amount.
 */
export async function cancelParty(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	cancelledBy: CancelledBy;
	/** Minor units; required when `cancelledBy` is 'guest'. */
	amount?: number;
	actorId: string;
	now?: Date;
}): Promise<PartyActionResult> {
	const denied = refusal(input.access);
	if (denied) return { ok: false, error: denied };
	if (!(await currentDayReservation(input.access, input.eventId, input.reservationId))) {
		return { ok: false, error: "Cette réservation n'est pas pour le jour en cours." };
	}

	try {
		const result = await cancelWithRefund(
			input.reservationId,
			{ cancelledBy: input.cancelledBy, amount: input.amount, now: input.now }
		);
		await recordAuditLog({
			adminId: input.actorId,
			action: 'reservation.cancel',
			entityType: 'reservation',
			entityId: input.reservationId,
			metadata: {
				cancelledBy: result.cancelledBy,
				suggestedAmount: result.suggestedAmount,
				appliedAmount: result.appliedAmount,
				refundable: result.refundable,
			},
		});
		return {
			ok: true,
			message:
				result.appliedAmount > 0
					? `Réservation annulée, ${formatCurrency(result.appliedAmount, result.currency, 'fr-FR')} remboursés`
					: 'Réservation annulée, sans remboursement',
		};
	} catch (err) {
		if (err instanceof CancellationError) return { ok: false, error: err.message };
		logger.error({ err, reservationId: input.reservationId }, 'Staff cancellation failed');
		return { ok: false, error: 'Échec de l’annulation de la réservation' };
	}
}

/**
 * Refund part (or all) of what a party paid online, without cancelling —
 * the admin `refund` action's logic. `amount` is in minor units; omitted
 * means the whole refundable remainder.
 */
export async function refundParty(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	amount?: number;
	actorId: string;
}): Promise<PartyActionResult> {
	const denied = refusal(input.access);
	if (denied) return { ok: false, error: denied };
	const currency = await currentDayReservation(input.access, input.eventId, input.reservationId);
	if (!currency) {
		return { ok: false, error: "Cette réservation n'est pas pour le jour en cours." };
	}

	try {
		await processRefund(input.reservationId, input.amount);
	} catch (err) {
		return { ok: false, error: refundErrorMessage(err) };
	}
	await recordAuditLog({
		adminId: input.actorId,
		action: 'reservation.refund',
		entityType: 'reservation',
		entityId: input.reservationId,
		metadata: input.amount ? { amount: input.amount } : null,
	});
	return {
		ok: true,
		message: input.amount
			? `Remboursement de ${formatCurrency(input.amount, currency, 'fr-FR')} effectué`
			: 'Remboursement effectué',
	};
}

/**
 * Fill each party's refund figures (`paidOnline`, `refundable`,
 * `suggestedRefund`) for a viewer who can cancel/refund: one query for the
 * parties' payments, the Event's Refund Policy applied in memory. Parties
 * that paid nothing online (walk-ins, comps) get 0s: cancelling them
 * refunds nothing and « Rembourser » is not offered.
 */
export async function withRefundInfo(
	access: StaffAccess,
	eventId: string,
	list: DayGuestList,
	now: Date = new Date()
): Promise<DayGuestList> {
	if (!access.can('cancel_refund')) return list;

	const ids = list.seatings.flatMap((s) => s.parties).map((p) => p.id).filter((id): id is string => Boolean(id));
	const paymentByReservation = new Map<string, { amount: number; refundedAmount: number; status: string }>();
	if (ids.length > 0) {
		const rows = await db
			.select({
				reservationId: payments.reservationId,
				amount: payments.amount,
				refundedAmount: payments.refundedAmount,
				status: payments.status,
			})
			.from(payments)
			.where(inArray(payments.reservationId, ids));
		for (const row of rows) paymentByReservation.set(row.reservationId, row);
	}
	const [event] = await db
		.select({
			refundPolicyType: events.refundPolicyType,
			refundPolicyTextEn: events.refundPolicyTextEn,
			refundPolicyTextFr: events.refundPolicyTextFr,
			refundPolicyTiers: events.refundPolicyTiers,
		})
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);
	const policy = refundPolicyOf(event ?? {});

	for (const seating of list.seatings) {
		for (const party of seating.parties) {
			if (!party.id) continue;
			const payment = paymentByReservation.get(party.id);
			party.paidOnline = payment ? refundableAmount(payment) + (payment.refundedAmount ?? 0) : 0;
			party.refundable = refundableAmount(payment);
			party.suggestedRefund =
				party.refundable > 0
					? cancellationPreFill({
							policy,
							seatingStart: new Date(seating.startTime),
							now,
							refundable: party.refundable,
						}).suggestedAmount
					: 0;
		}
	}
	return list;
}

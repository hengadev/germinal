/**
 * Balance settlement (issue 019): Staff mark a party's Balance as settled
 * once it has been collected on the venue's terminal. Settling records
 * who and when only — no amount, no payment method: the terminal's own
 * report is the accounting for money taken on site. Every change is
 * checked against Staff access on the server, and safe under concurrency:
 * the Reservation's row is locked before it is read.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions, giftCardLedger, giftCards, reservations } from '../db/schema';
import type { StaffAccess } from '$lib/staff/access';
import { recordAuditLog } from './audit-log';
import { creditGiftCard, findUsableGiftCard, redeemGiftCard } from './gift-cards';

export type BalanceResult = { ok: true } | { ok: false; error: string };

/** Why a gift card cannot pay (issue 066), as the door says it. */
const GIFT_CARD_REFUSALS: Record<string, string> = {
	unknown: 'Carte cadeau inconnue.',
	cancelled: 'Carte cadeau annulée.',
	expired: 'Carte cadeau expirée.',
	empty: 'Carte cadeau sans solde.'
};

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
 * Mark a Reservation's Balance as settled from the Admin back office
 * (issue 044). Same rules and same audit entry as the Staff portal's
 * settleBalance, minus the Staff permission and current-Day checks, which
 * only make sense on the Staff portal.
 */
export async function settleBalanceAsAdmin(input: {
	reservationId: string;
	actorId: string;
}): Promise<BalanceResult> {
	const { reservationId, actorId } = input;

	return db.transaction(async (tx: typeof db) => {
		const [party] = await tx
			.select({
				status: reservations.status,
				isComp: reservations.isComp,
				balanceAmount: reservations.balanceAmount,
				balanceSettledAt: reservations.balanceSettledAt
			})
			.from(reservations)
			.where(eq(reservations.id, reservationId))
			.for('update', { of: reservations });

		if (!party) {
			return { ok: false as const, error: 'Réservation introuvable.' };
		}
		if (party.status !== 'confirmed') {
			return { ok: false as const, error: 'Cette réservation n’est pas confirmée.' };
		}
		if (party.isComp || party.balanceAmount <= 0) {
			return { ok: false as const, error: 'Cette réservation n’a pas de solde à régler.' };
		}
		if (party.balanceSettledAt !== null) {
			return { ok: false as const, error: 'Le solde de cette réservation est déjà réglé.' };
		}

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

/** What a gift card paid toward the Balance: how much was applied, what
 * is left on the card, and what — if anything — still has to be paid on
 * the venue's terminal. */
export type GiftCardSettlementResult =
	| {
			ok: true;
			/** Cents taken from the card this time. */
			applied: number;
			/** The card's balance afterwards. */
			cardBalanceLeft: number;
			/** Still owed on the terminal after this redemption. */
			remainder: number;
			/** True when nothing is owed anymore and the Balance is settled. */
			settled: boolean;
	  }
	| { ok: false; error: string };

/** The net amount already redeemed at the door for a Reservation: the
 * 'door' ledger rows are negative (positive when an undo credited the
 * card back), so adding them back to the Balance gives what is still owed. */
async function doorRedeemedSoFar(reservationId: string, tx: typeof db): Promise<number> {
	const [row] = await tx
		.select({ total: sql<string>`coalesce(sum(${giftCardLedger.amount}), 0)` })
		.from(giftCardLedger)
		.where(
			sql`${giftCardLedger.reservationId} = ${reservationId} and ${giftCardLedger.reason} = 'door'`
		);
	return Number(row?.total ?? 0);
}

/**
 * Settle a Balance — or part of it — with a gift card at the door (issue
 * 066). Same permission and checks as settleBalance, plus the card's
 * own usability: the card is redeemed for the smaller of what is still
 * owed and its balance, reason 'door', linked to the Reservation. The
 * Balance is only marked settled once nothing is owed anymore;
 * balanceAmount itself never changes. Gift cards are EUR only.
 */
export async function settleBalanceWithGiftCard(input: {
	access: StaffAccess;
	eventId: string;
	reservationId: string;
	actorId: string;
	code: string;
}): Promise<GiftCardSettlementResult> {
	const { access, eventId, reservationId, actorId, code } = input;

	if (!access.can('settle_balance')) {
		return { ok: false, error: "Vous n'avez pas la permission de régler un solde." };
	}

	return db.transaction(async (tx: typeof db) => {
		// Lock the Reservation's row: like settleBalance, so a redemption
		// can never interleave with a settlement or an undo.
		const [party] = await tx
			.select({
				status: reservations.status,
				isComp: reservations.isComp,
				balanceAmount: reservations.balanceAmount,
				currency: reservations.currency,
				balanceSettledAt: reservations.balanceSettledAt,
				eventId: eventSessions.eventId,
				day: eventDays.date
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
				error: "Cette réservation n'est pas pour le jour en cours."
			};
		}
		if (party.isComp || party.balanceAmount <= 0) {
			return {
				ok: false as const,
				error: 'Cette réservation n’a pas de solde à régler.'
			};
		}
		if (party.balanceSettledAt !== null) {
			return { ok: false as const, error: 'Le solde de cette réservation est déjà réglé.' };
		}
		if (party.currency !== 'EUR') {
			return {
				ok: false as const,
				error: 'Les cartes cadeau sont en euros : elles ne peuvent pas régler ce solde.'
			};
		}

		// What is still owed: the Balance minus the net of the door
		// redemptions already recorded for this Reservation.
		const owed = party.balanceAmount + (await doorRedeemedSoFar(reservationId, tx));
		if (owed <= 0) {
			return { ok: false as const, error: 'Le solde de cette réservation est déjà réglé.' };
		}

		const found = await findUsableGiftCard(code, tx);
		if (!found.ok) {
			return { ok: false as const, error: GIFT_CARD_REFUSALS[found.reason] ?? 'Carte cadeau inconnue.' };
		}

		const applied = Math.min(owed, found.card.balance);
		const redeemed = await redeemGiftCard(found.card.code, {
			amount: applied,
			reason: 'door',
			reservationId,
			actorId,
			tx
		});
		if (!redeemed.ok) {
			return { ok: false as const, error: redeemed.error };
		}

		const remainder = owed - applied;
		const settled = remainder === 0;
		if (settled) {
			await tx
				.update(reservations)
				.set({ balanceSettledAt: new Date(), balanceSettledBy: actorId, updatedAt: new Date() })
				.where(eq(reservations.id, reservationId));
		}

		await recordAuditLog({
			adminId: actorId,
			action: settled
				? 'reservation.balance_settled'
				: 'reservation.balance_gift_card_redeemed',
			entityType: 'reservation',
			entityId: reservationId,
			metadata: { reservationId, applied, remainder }
		});

		return {
			ok: true as const,
			applied,
			cardBalanceLeft: redeemed.card.balance,
			remainder,
			settled
		};
	});
}

/**
 * Undo a settlement: both fields are cleared. Requires the "correct a
 * mistake" permission (Admins hold every permission). Every gift card
 * redeemed at the door for this Reservation is credited back — net of
 * earlier credits, once — in the same transaction (issue 066).
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
			.select({
				eventId: eventSessions.eventId,
				day: eventDays.date,
				balanceSettledAt: reservations.balanceSettledAt,
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
		// Corrections stay on the Day under way, like the actions they undo.
		if (access.day === null || String(party.day) !== access.day) {
			return { ok: false as const, error: "Cette réservation n'est pas pour le jour en cours." };
		}
		if (party.balanceSettledAt === null) {
			return { ok: false as const, error: 'Le solde de cette réservation n’est pas réglé.' };
		}

		// Issue 066 : chaque carte cadeau utilisée à la porte pour cette
		// Réservation est recréditée une seule fois. Le recrédit est une
		// ligne « door » positive : les lignes « door » d'une carte se
		// compensent, ce qui reste négatif lui est encore dû, et le calcul
		// du restant dû (doorRedeemedSoFar) repart de zéro.
		const doorCards = await tx
			.select({
				code: giftCards.code,
				net: sql<string>`coalesce(sum(${giftCardLedger.amount}), 0)`
			})
			.from(giftCardLedger)
			.innerJoin(giftCards, eq(giftCardLedger.giftCardId, giftCards.id))
			.where(
				sql`${giftCardLedger.reservationId} = ${reservationId} and ${giftCardLedger.reason} = 'door'`
			)
			.groupBy(giftCards.code);
		let creditedBack = 0;
		for (const card of doorCards) {
			const net = Number(card.net);
			if (net >= 0) continue;
			const credited = await creditGiftCard(card.code, {
				amount: -net,
				reason: 'door',
				reservationId,
				actorId,
				tx
			});
			if (!credited.ok) {
				return { ok: false as const, error: credited.error };
			}
			creditedBack += -net;
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
			metadata: { reservationId, giftCardCreditedBack: creditedBack },
		});

		return { ok: true as const };
	});
}

/**
 * Reservation transitions (security audit, Module 2 — issue 013).
 *
 * One module owns every Reservation status change. A transition is a single
 * conditional UPDATE that names the expected current status: of any number
 * of concurrent callers, exactly one wins, and only the winner runs the
 * side effects that belong to the transition. Idempotency for the payment
 * webhooks comes from the transition itself, not from a read-then-write on
 * `webhookProcessedAt`.
 *
 * Transitions: **pending → confirmed** (a paid Checkout Session),
 * **pending → expired** (a failed payment, or the hold running out),
 * **confirmed → cancelled** (a cancellation; Stripe refunds happen after
 * the commit, never while a Seating row lock is held).
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { eventSessions, payments, reservationStatusEnum, reservations } from '../db/schema';

export type ReservationStatus = (typeof reservationStatusEnum.enumValues)[number];

export interface ConfirmOutcome {
	/** Whether this caller performed the transition. */
	won: boolean;
	/** The Reservation's status as it stands after the attempt (null: no such row). */
	status: ReservationStatus | null;
}

/**
 * **pending → confirmed**: the transition a paid Checkout Session makes.
 *
 * One conditional update; the winner's payment becomes `succeeded` —
 * swapping the Checkout Session placeholder for the real PaymentIntent id —
 * inside the same transaction, so a payment is never recorded succeeded for
 * a Reservation that stayed pending, and a Reservation is never confirmed
 * (nor sent a Ticket) twice, however often Stripe delivers the event.
 *
 * A loser learns the Reservation's current status instead, so a payment
 * that arrived after the hold expired can be refunded by the caller.
 */
export async function confirmReservationForPayment(input: {
	reservationId: string;
	paymentId: string;
	/** The session's real PaymentIntent id, when it has one. */
	paymentIntentId: string | null;
	/** The Charge id, when the caller knows it (payment_intent events). */
	stripeChargeId?: string | null;
}): Promise<ConfirmOutcome> {
	return db.transaction(async (tx: typeof db) => {
		const now = new Date();

		const [confirmed] = await tx
			.update(reservations)
			.set({
				status: 'confirmed',
				confirmedAt: now,
				updatedAt: now,
			})
			.where(and(
				eq(reservations.id, input.reservationId),
				// Name the expected current status: a Reservation that expired,
				// was cancelled or is already confirmed makes this caller lose.
				eq(reservations.status, 'pending'),
			))
			.returning({ id: reservations.id });

		if (!confirmed) {
			const [current] = await tx
				.select({ status: reservations.status })
				.from(reservations)
				.where(eq(reservations.id, input.reservationId));
			return { won: false, status: current?.status ?? null };
		}

		// Winner only: the payment is updated in the same transaction as the
		// transition it pays for.
		await tx.update(payments)
			.set({
				status: 'succeeded',
				...(input.paymentIntentId ? { stripePaymentIntentId: input.paymentIntentId } : {}),
				...(input.stripeChargeId !== undefined ? { stripeChargeId: input.stripeChargeId } : {}),
				webhookProcessedAt: now,
				updatedAt: now,
			})
			.where(eq(payments.id, input.paymentId));

		return { won: true, status: 'confirmed' };
	});
}

/**
 * **pending → expired** for a failed payment (a card declined at checkout,
 * or a delayed payment method failing). One conditional update: only the
 * winner marks the payment failed and gives the seats back, so a failure
 * delivered twice, or racing the expiry job, restores capacity once.
 */
export async function expireReservationForFailedPayment(input: {
	reservationId: string;
	paymentId: string;
	lastError: string | null;
}): Promise<{ won: boolean }> {
	return db.transaction(async (tx: typeof db) => {
		const now = new Date();

		const [expired] = await tx
			.update(reservations)
			.set({ status: 'expired', updatedAt: now })
			.where(and(eq(reservations.id, input.reservationId), eq(reservations.status, 'pending')))
			.returning({ eventSessionId: reservations.eventSessionId, quantity: reservations.quantity });

		if (!expired) return { won: false };

		await tx.update(payments)
			.set({ status: 'failed', lastError: input.lastError, webhookProcessedAt: now, updatedAt: now })
			.where(eq(payments.id, input.paymentId));

		await restoreCapacity(tx, expired.eventSessionId, expired.quantity);

		return { won: true };
	});
}

/**
 * **pending → expired** when the hold runs out (the expiry job). One
 * conditional update: a Reservation confirmed by the webhook in the
 * meantime makes this caller lose, and nothing happens. Only the winner
 * gives the seats back.
 *
 * The payment is left `pending`: its Stripe side (Checkout Session or
 * PaymentIntent) is still open until the job closes it, and an expired
 * Reservation with a `pending` payment is how the job finds what is left
 * to close.
 */
export async function expireReservationOnHoldTimeout(reservationId: string): Promise<
	| { won: false }
	| { won: true; eventSessionId: string; quantity: number; allowWaitlist: boolean }
> {
	return db.transaction(async (tx: typeof db) => {
		const [expired] = await tx
			.update(reservations)
			.set({ status: 'expired', updatedAt: new Date() })
			.where(and(eq(reservations.id, reservationId), eq(reservations.status, 'pending')))
			.returning({ eventSessionId: reservations.eventSessionId, quantity: reservations.quantity });

		if (!expired) return { won: false };

		const seating = await restoreCapacity(tx, expired.eventSessionId, expired.quantity);

		return {
			won: true,
			eventSessionId: expired.eventSessionId,
			quantity: expired.quantity,
			allowWaitlist: seating?.allowWaitlist ?? false,
		};
	});
}

/**
 * **confirmed → cancelled** (by default; `from` widens the statuses a
 * caller may cancel). One short transaction: the conditional update and the
 * capacity restore. Of any number of concurrent cancellations exactly one
 * wins; the losers change nothing. The winner gets what it needs to refund
 * and notify after the commit.
 */
export async function cancelReservationTransition(
	reservationId: string,
	options: { from?: ReservationStatus[] } = {}
): Promise<
	| { won: false }
	| { won: true; eventSessionId: string; quantity: number; allowWaitlist: boolean; previousStatus: ReservationStatus }
> {
	const from = options.from ?? ['confirmed'];
	return db.transaction(async (tx: typeof db) => {
		// Lock the row so the status read here is the one the update replaces.
		const [current] = await tx
			.select({ status: reservations.status })
			.from(reservations)
			.where(eq(reservations.id, reservationId))
			.for('update');
		const now = new Date();

		const [cancelled] = await tx
			.update(reservations)
			.set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
			.where(and(eq(reservations.id, reservationId), inArray(reservations.status, from)))
			.returning({ eventSessionId: reservations.eventSessionId, quantity: reservations.quantity });

		if (!cancelled || !current) return { won: false };

		// An expired Reservation's seats were already given back.
		const seating =
			current.status === 'expired'
				? null
				: await restoreCapacity(tx, cancelled.eventSessionId, cancelled.quantity);

		return {
			won: true,
			eventSessionId: cancelled.eventSessionId,
			quantity: current.status === 'expired' ? 0 : cancelled.quantity,
			allowWaitlist: seating?.allowWaitlist ?? false,
			previousStatus: current.status,
		};
	});
}

/**
 * Give a released Reservation's seats back to its Seating, under the
 * Seating's row lock, never above its total. Winner-only: callers run it
 * inside the transaction whose conditional update they won.
 */
async function restoreCapacity(tx: typeof db, eventSessionId: string, quantity: number) {
	const [seating] = await tx
		.select()
		.from(eventSessions)
		.where(eq(eventSessions.id, eventSessionId))
		.for('update');

	if (seating) {
		await tx.update(eventSessions)
			.set({
				availableCapacity: Math.min(seating.availableCapacity + quantity, seating.totalCapacity),
				updatedAt: new Date(),
			})
			.where(eq(eventSessions.id, seating.id));
	}
	return seating;
}

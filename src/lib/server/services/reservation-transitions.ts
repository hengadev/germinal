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
 * This issue adds **pending → confirmed** (a paid Checkout Session) and
 * **pending → expired** for a failed payment.
 * Issues 014–016 move pending → expired and confirmed → cancelled onto the
 * same module.
 */

import { and, eq } from 'drizzle-orm';
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

		const [seating] = await tx
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, expired.eventSessionId))
			.for('update');

		if (seating) {
			await tx.update(eventSessions)
				.set({
					availableCapacity: Math.min(seating.availableCapacity + expired.quantity, seating.totalCapacity),
					updatedAt: now,
				})
				.where(eq(eventSessions.id, seating.id));
		}

		return { won: true };
	});
}

/**
 * Party size (issue 046): an Admin changes a confirmed Reservation's
 * number of Guests (a Staff permission comes later, issue 047's sibling).
 * The quote (lib/utils/party-size) prices the change; this service applies
 * it in one transaction under the Seating's row lock: additions take seats
 * with the overflow-allowing decrement (capacity warns, never refuses),
 * removals give them back. The Ticket is untouched; the settled mark is
 * cleared when the Balance grows, so the extra is collected. After the
 * commit the Guest gets a « Réservation modifiée » email when they have
 * one.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
	checkIns,
	eventDays,
	eventServices,
	eventSessions,
	events,
	payments,
	reservations,
} from '../db/schema';
import { recordAuditLog } from './audit-log';
import { lockAndDecrementSeatingAllowingOverflow } from './reservations';
import { restoreCapacity } from './reservation-transitions';
import { refundAfterCancellation } from './cancellation-effects';
import { sendReservationModifiedEmail } from './email';
import { logger } from '$lib/server/logger';
import { seatingTitle } from '$lib/utils/seating-title';
import { quotePartySize } from '$lib/utils/party-size';
import { refundableAmount } from '$lib/utils/cancellation-refund';
import { refundPolicyOf } from '$lib/utils/refund-policy';

export type ChangeGuestsResult =
	| { ok: true; overflow: number; quantity: number; total: number; balance: number; currency: string; refunded: number }
	| { ok: false; error: string };

export async function changeGuests(input: {
	reservationId: string;
	quantity: number;
	actorId: string;
	/** The refund the Admin asked for, in cents (issue 047): clamped to
	 * the over-paid amount and to what the Payment can still refund. */
	refundAmount?: number;
	now?: Date;
}): Promise<ChangeGuestsResult> {
	const { reservationId, quantity, actorId } = input;
	const now = input.now ?? new Date();

	// Email data filled inside the transaction, sent only once it commits:
	// a send failure must not fail the change. A box, so the transaction's
	// assignment is visible after it.
	const out: { email?: Parameters<typeof sendReservationModifiedEmail>[0] } = {};
	// The refund (issue 047), decided inside the transaction, made after it.
	const refund: {
		amount: number;
		payment?: { id: string; stripePaymentIntentId: string; currency: string; refundedAmount: number };
		idempotencyKey?: string;
	} = { amount: 0 };

	const result = await db.transaction(async (tx: typeof db) => {
		// Lock the Reservation's row so a simultaneous change, cancellation
		// or Move cannot interleave.
		const [party] = await tx
			.select({
				status: reservations.status,
				quantity: reservations.quantity,
				totalAmount: reservations.totalAmount,
				balanceAmount: reservations.balanceAmount,
				currency: reservations.currency,
				isComp: reservations.isComp,
				guestEmail: reservations.guestEmail,
				guestName: reservations.guestName,
				locale: reservations.locale,
				accessToken: reservations.accessToken,
				paymentId: reservations.paymentId,
				seatingId: eventSessions.id,
				startTime: eventSessions.startTime,
				titleFr: eventSessions.titleFr,
				titleEn: eventSessions.titleEn,
				timeZone: events.timeZone,
				eventTitleEn: events.titleEn,
				eventTitleFr: events.titleFr,
				refundPolicyType: events.refundPolicyType,
				refundPolicyTextEn: events.refundPolicyTextEn,
				refundPolicyTextFr: events.refundPolicyTextFr,
				refundPolicyTiers: events.refundPolicyTiers,
			})
			.from(reservations)
			.innerJoin(eventSessions, eq(reservations.eventSessionId, eventSessions.id))
			.innerJoin(events, eq(eventSessions.eventId, events.id))
			.where(eq(reservations.id, reservationId))
			.for('update', { of: reservations });

		if (!party) return { ok: false as const, error: 'Réservation introuvable.' };

		// The Deposit really paid online, minus refunds (null payment: a
		// Walk-in or Comp, nothing was paid online).
		let depositPaid = 0;
		let paymentRow: { id: string; stripePaymentIntentId: string; currency: string; amount: number; refundedAmount: number | null; status: string } | undefined;
		if (party.paymentId) {
			const [payment] = await tx
				.select({
					id: payments.id,
					stripePaymentIntentId: payments.stripePaymentIntentId,
					currency: payments.currency,
					amount: payments.amount,
					refundedAmount: payments.refundedAmount,
					status: payments.status,
				})
				.from(payments)
				.where(eq(payments.id, party.paymentId));
			if (payment) {
				paymentRow = payment;
				depositPaid = payment.amount - (payment.refundedAmount ?? 0);
			}
		}

		const [{ arrived }] = await tx
			.select({ arrived: sql<number>`coalesce(sum(${checkIns.guests}), 0)::int` })
			.from(checkIns)
			.where(and(eq(checkIns.reservationId, reservationId), isNull(checkIns.undoneAt)));

		const quote = quotePartySize(
			{
				quantity: party.quantity,
				total: party.totalAmount,
				depositPaid,
				balance: party.balanceAmount,
				isComp: party.isComp,
				checkedIn: arrived,
				status: party.status,
				refundPolicy: refundPolicyOf(party),
				seatingStart: party.startTime,
				now,
			},
			quantity
		);
		if (!quote.ok) return { ok: false as const, error: quote.error };

		// The refund never exceeds what is over-paid by this change, nor
		// what the Payment can still refund (issue 047).
		refund.amount = paymentRow
			? Math.max(
					0,
					Math.min(input.refundAmount ?? 0, quote.quote.overPaid, refundableAmount(paymentRow))
			)
			: 0;
		if (refund.amount > 0) {
			refund.payment = {
				id: paymentRow.id,
				stripePaymentIntentId: paymentRow.stripePaymentIntentId,
				currency: paymentRow.currency,
				refundedAmount: paymentRow.refundedAmount ?? 0,
			};
			refund.idempotencyKey = `party-size:${reservationId}:${party.quantity}->${quantity}:${now.getTime()}`;
		}

		const delta = quantity - party.quantity;
		let overflow = 0;
		if (delta > 0) {
			// Never refuse beyond capacity (ADR 0009): the counter is floored
			// at 0 and the caller is told how far past it went.
			const seating = await lockAndDecrementSeatingAllowingOverflow(tx, party.seatingId, delta);
			overflow =
				seating.availableCapacity === null
					? 0
					: Math.max(0, delta - seating.availableCapacity);
		} else if (delta < 0) {
			// The Reservation holds fewer seats first, then the release counts
			// what is really free (as for a cancellation).
			await tx
				.update(reservations)
				.set({ quantity, updatedAt: now })
				.where(eq(reservations.id, reservationId));
			await restoreCapacity(tx, party.seatingId, -delta);
		}

		const settled =
			quote.quote.balance > party.balanceAmount
				? { balanceSettledAt: null, balanceSettledBy: null }
				: {};
		await tx
			.update(reservations)
			.set({
				quantity,
				totalAmount: quote.quote.total,
				balanceAmount: quote.quote.balance,
				updatedAt: now,
				...settled,
			})
			.where(eq(reservations.id, reservationId));

		await recordAuditLog({
			adminId: actorId,
			action: 'reservation.change_guests',
			entityType: 'reservation',
			entityId: reservationId,
			metadata: {
				reservationId,
				before: {
					quantity: party.quantity,
					total: party.totalAmount,
					balance: party.balanceAmount,
				},
				after: { quantity, total: quote.quote.total, balance: quote.quote.balance },
				overflow,
				...(refund.amount > 0 ? { refundAmount: refund.amount } : {}),
			},
		});

		// Issue 025: the email is written in the Guest's language, defaulting
		// to English when it is unknown (null).
		const lang = party.locale === 'fr' ? 'fr' : 'en';
		out.email = {
			guestEmail: party.guestEmail,
			guestName: party.guestName ?? '',
			eventTitle:
				(lang === 'fr'
					? party.eventTitleFr || party.eventTitleEn
					: party.eventTitleEn || party.eventTitleFr) || '',
			sessionTitle: seatingTitle(
				{ titleEn: party.titleEn, titleFr: party.titleFr, startTime: party.startTime },
				lang,
				{ timeZone: party.timeZone }
			),
			sessionStartTime: party.startTime,
			timeZone: party.timeZone,
			reservationId,
			accessToken: party.accessToken,
			locale: party.locale as 'fr' | 'en' | null,
			partyChange: {
				quantity,
				balanceDue: quote.quote.balance,
				currency: party.currency,
				...(refund.amount > 0 ? { refundedAmount: refund.amount } : {}),
			},
		};

		return { ok: true as const, overflow, quantity, total: quote.quote.total, balance: quote.quote.balance, currency: party.currency, refunded: refund.amount };
	});

	if (!result.ok) return result;

	// The refund goes through the cancellation path (issue 047), after the
	// commit and never under the Seating row lock. The idempotency key is
	// derived from the Reservation and the change, so a retried action
	// (which finds the quantity already changed and refunds nothing) can
	// never refund twice.
	if (refund.amount > 0 && refund.payment) {
		try {
			await refundAfterCancellation(refund.payment, refund.amount, refund.idempotencyKey!);
		} catch (err) {
			logger.error({ err, reservationId }, 'Party-size refund failed after the change');
		}
	}

	const email = out.email;
	if (email?.guestEmail) {
		try {
			await sendReservationModifiedEmail(email);
		} catch (err) {
			// The change itself is done and durable: only the notification
			// failed, and that must not fail the change.
			logger.error({ err, reservationId }, 'Failed to send the modified reservation email');
		}
	}
	return result;
}

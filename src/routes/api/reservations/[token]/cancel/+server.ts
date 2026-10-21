import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReservationByToken } from '$lib/server/services/reservations';
import { logger } from '$lib/server/logger';
import { seatingTitle } from '$lib/utils/seating-title';
import { CancellationError, cancelByGuest, getGuestCancellationTerms } from '$lib/server/services/cancellation';

/**
 * Self-service cancellation from the Ticket (issue 028): the Event's Refund
 * Policy decides.
 * - Manual policy (every migrated Event — its statement promises exactly
 *   this): cancellable up to 24 hours before the Seating, with a full
 *   refund of what was paid online — the historical behaviour, unchanged.
 * - Rule-based policy: cancellable until the Seating starts; the refund is
 *   the policy's amount (possibly nothing — the seats are freed anyway).
 * See guestCancellationTerms and cancelByGuest.
 */
// POST /api/reservations/[token]/cancel - Cancel a reservation
export const POST: RequestHandler = async ({ params }) => {
	const { token } = params;

	try {
		const reservation = await getReservationByToken(token);

		if (!reservation) {
			return json({ error: 'Reservation not found' }, { status: 404 });
		}

		// One conditional cancellation: parallel requests cancel, refund and
		// notify once; the others get the normal "cannot cancel" answer.
		const result = await cancelByGuest(reservation.id);
		logger.info(`Reservation ${reservation.id} cancelled by user (refund ${result.refundAmount})`);
		return json({
			success: true,
			refund: result.refundAmount > 0 ? { amount: result.refundAmount, currency: result.currency } : null,
		});
	} catch (error) {
		if (error instanceof CancellationError) {
			return json({ error: error.message || 'Cannot cancel reservation' }, { status: 400 });
		}
		logger.error({ err: error }, 'Failed to cancel reservation');
		return json({ error: 'Failed to cancel reservation' }, { status: 500 });
	}
};

// GET /api/reservations/[token]/cancel - Check if reservation can be cancelled
export const GET: RequestHandler = async ({ params }) => {
	const { token } = params;

	try {
		const reservation = await getReservationByToken(token);

		if (!reservation) {
			return json({ error: 'Reservation not found' }, { status: 404 });
		}

		const terms = await getGuestCancellationTerms(reservation.id);

		return json({
			canCancel: terms.canCancel,
			reason: terms.canCancel ? null : terms.reason,
			// The refund the guest would get if they cancel now (minor units).
			refund: terms.canCancel ? { amount: terms.refundAmount, currency: terms.currency } : null,
			reservation: {
				id: reservation.id,
				status: reservation.status,
				eventTitle: reservation.eventSession.event.titleEn,
				sessionTitle: seatingTitle(reservation.eventSession, 'en', { timeZone: reservation.eventSession.event.timeZone }),
				sessionStartTime: reservation.eventSession.startTime,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to check cancellation status');
		return json({ error: 'Failed to check cancellation status' }, { status: 500 });
	}
};

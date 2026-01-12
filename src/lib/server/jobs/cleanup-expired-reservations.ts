import { findExpiredReservations, expireReservation } from '../services/reservations';
import { cancelPaymentIntent } from '../services/stripe';
import { jobLogger } from '../logger';

/**
 * Cleanup job to expire abandoned reservations and restore capacity
 * Run this every 5 minutes via pg-boss
 */
export async function cleanupExpiredReservations() {
	jobLogger.info('[Cleanup Job] Starting expired reservations cleanup');

	try {
		const expiredReservations = await findExpiredReservations();

		if (expiredReservations.length === 0) {
			return { cleaned: 0 };
		}

		jobLogger.info({ count: expiredReservations.length }, '[Cleanup Job] Found expired reservations');

		let cleaned = 0;
		const errors: string[] = [];

		for (const reservation of expiredReservations) {
			try {
				// Expire reservation and restore capacity
				await expireReservation(reservation.id);

				// Cancel Stripe PaymentIntent
				if (reservation.payment) {
					await cancelPaymentIntent(reservation.payment.stripePaymentIntentId);
				}

				jobLogger.debug({ reservationId: reservation.id }, '[Cleanup Job] Expired reservation');
				cleaned++;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				jobLogger.error({ reservationId: reservation.id, error: errorMsg }, '[Cleanup Job] Failed to expire reservation');
				errors.push(`${reservation.id}: ${errorMsg}`);
			}
		}

		jobLogger.info({ cleaned, errors, failedCount: errors.length }, '[Cleanup Job] Completed');

		return { cleaned, errors };
	} catch (error) {
		jobLogger.error({ err: error }, '[Cleanup Job] Error during cleanup');
		throw error;
	}
}

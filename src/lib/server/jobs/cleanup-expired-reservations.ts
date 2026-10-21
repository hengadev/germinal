import {
	findExpiredReservations,
	expireReservation,
	findExpiredPaymentsToClose,
	markExpiredPaymentClosed,
} from '../services/reservations';
import { closeStripePayment } from '../services/stripe';
import { jobLogger } from '../logger';

/**
 * Cleanup job to expire abandoned reservations and restore capacity
 * Run this every 5 minutes via pg-boss
 */
export async function cleanupExpiredReservations() {
	jobLogger.info('[Cleanup Job] Starting expired reservations cleanup');

	try {
		const expiredReservations = await findExpiredReservations();

		if (expiredReservations.length > 0) {
			jobLogger.info({ count: expiredReservations.length }, '[Cleanup Job] Found expired reservations');
		}

		let cleaned = 0;
		const errors: string[] = [];

		for (const reservation of expiredReservations) {
			try {
				// Expire reservation and restore capacity (a no-op if the
				// webhook confirmed it in the meantime)
				await expireReservation(reservation.id);
				jobLogger.debug({ reservationId: reservation.id }, '[Cleanup Job] Expired reservation');
				cleaned++;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				jobLogger.error({ reservationId: reservation.id, error: errorMsg }, '[Cleanup Job] Failed to expire reservation');
				errors.push(`${reservation.id}: ${errorMsg}`);
			}
		}

		// Close the Stripe side of every expired Reservation's still-open
		// payment — the ones just expired, and any a previous run couldn't
		// close (Stripe unreachable). Expiry itself is never retried.
		let closed = 0;
		for (const payment of await findExpiredPaymentsToClose()) {
			try {
				await closeStripePayment(payment.stripePaymentIntentId);
				await markExpiredPaymentClosed(payment.id);
				closed++;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				jobLogger.error({ paymentId: payment.id, error: errorMsg }, '[Cleanup Job] Failed to close the Stripe side; retrying next run');
				errors.push(`payment ${payment.id}: ${errorMsg}`);
			}
		}

		jobLogger.info({ cleaned, closed, errors, failedCount: errors.length }, '[Cleanup Job] Completed');

		return { cleaned, closed, errors };
	} catch (error) {
		jobLogger.error({ err: error }, '[Cleanup Job] Error during cleanup');
		throw error;
	}
}

import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { requireAdmin } from '$lib/server/guards';
import { cancelReservationWithRefund } from '$lib/server/services/reservations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);

	try {
		const result = await cancelReservationWithRefund(event.params.id);

		return json({
			success: true,
			message: 'Reservation cancelled and refunded successfully',
			refund: result.refund,
		});
	} catch (error) {
		logger.error({ err: error }, 'Failed to cancel reservation');

		if (error instanceof Error) {
			if (error.message === 'Reservation not found') {
				return json({ error: 'Reservation not found' }, { status: 404 });
			}

			if (error.message === 'Only confirmed reservations can be cancelled') {
				return json({ error: 'This reservation cannot be cancelled' }, { status: 400 });
			}
		}

		return json({ error: error instanceof Error ? error.message : 'Failed to cancel reservation' }, { status: 500 });
	}
};

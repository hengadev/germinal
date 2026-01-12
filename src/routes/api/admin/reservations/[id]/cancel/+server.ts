import { json } from '@sveltejs/kit';
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
		console.error('Failed to cancel reservation:', error);

		if (error instanceof Error) {
			if (error.message === 'Reservation not found') {
				return json({ error: 'Reservation not found' }, { status: 404 });
			}

			if (error.message === 'Only confirmed reservations can be cancelled') {
				return json({ error: 'This reservation cannot be cancelled' }, { status: 400 });
			}
		}

		return json({ error: 'Failed to cancel reservation' }, { status: 500 });
	}
};

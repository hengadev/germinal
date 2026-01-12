import { json } from '@sveltejs/kit';
import { getReservationById } from '$lib/server/services/reservations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const reservation = await getReservationById(params.id);

		return json({
			id: reservation.id,
			status: reservation.status,
			expiresAt: reservation.expiresAt,
			confirmedAt: reservation.confirmedAt,
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'Reservation not found') {
			return json({ error: 'Reservation not found' }, { status: 404 });
		}
		throw error;
	}
};

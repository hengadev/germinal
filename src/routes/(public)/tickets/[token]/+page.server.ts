import { getReservationByToken } from '$lib/server/services/reservations';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import QRCode from 'qrcode';

export const load: PageServerLoad = async ({ params }) => {
	const reservation = await getReservationByToken(params.token);

	if (!reservation) {
		throw error(404, 'Ticket not found');
	}

	// Generate QR code as data URL
	const qrCodeUrl = await QRCode.toDataURL(
		`${process.env.PUBLIC_URL || 'http://localhost:5173'}/tickets/${params.token}`,
		{
			width: 300,
			margin: 2,
			color: {
				dark: '#1a1a1a',
				light: '#ffffff'
			}
		}
	);

	return {
		reservation: {
			id: reservation.id,
			guestName: reservation.guestName,
			guestEmail: reservation.guestEmail,
			quantity: reservation.quantity,
			totalAmount: reservation.totalAmount,
			currency: reservation.currency,
			status: reservation.status,
			confirmedAt: reservation.confirmedAt?.toISOString(),
			createdAt: reservation.createdAt.toISOString(),
			accessToken: params.token,
			session: {
				title: reservation.eventSession.title,
				startTime: reservation.eventSession.startTime.toISOString(),
				endTime: reservation.eventSession.endTime.toISOString(),
				event: reservation.eventSession.event
			},
			payment: reservation.payment ? {
				status: reservation.payment.status,
				receiptUrl: reservation.payment.receiptUrl
			} : null
		},
		qrCode: qrCodeUrl
	};
};

import { db } from '$lib/server/db';
import { reservations } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const allReservations = await db.query.reservations.findMany({
		orderBy: [desc(reservations.createdAt)],
		with: {
			eventSession: {
				with: {
					event: {
						columns: {
							title: true,
							slug: true
						}
					}
				}
			},
			payment: {
				columns: {
					status: true,
					amount: true,
					currency: true
				}
			}
		}
	});

	return {
		reservations: allReservations.map(r => ({
			id: r.id,
			guestName: r.guestName,
			guestEmail: r.guestEmail,
			quantity: r.quantity,
			totalAmount: r.totalAmount,
			currency: r.currency,
			status: r.status,
			createdAt: r.createdAt.toISOString(),
			confirmedAt: r.confirmedAt?.toISOString(),
			eventTitle: r.eventSession.event.title,
			sessionTitle: r.eventSession.title,
			sessionStartTime: r.eventSession.startTime.toISOString(),
			paymentStatus: r.payment?.status || 'none'
		}))
	};
};

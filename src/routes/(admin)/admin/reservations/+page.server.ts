import { env } from '$lib/server/env';
import { MOCK_RESERVATIONS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return mock reservations
		return {
			reservations: MOCK_RESERVATIONS
		};
	}

	// Database mode - use actual database
	const { db } = await import('$lib/server/db');
	const { reservations } = await import('$lib/server/db/schema');
	const { desc } = await import('drizzle-orm');

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

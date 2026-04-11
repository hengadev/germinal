import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';
import { or, ilike } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url }) => {
	// Get search query from URL
	const searchQuery = url.searchParams.get('q') || undefined;

	if (env.USE_MOCK_DATA) {
		// Mock mode - join reservations with sessions to get derived fields
		let reservations = MOCK_RESERVATIONS.map(r => {
			const session = MOCK_SESSIONS.find(s => s.id === r.eventSessionId);
			const event = MOCK_EVENTS.find(e => e.id === session?.eventId);
			return {
				id: r.id,
				guestName: r.guestName,
				guestEmail: r.guestEmail,
				quantity: r.quantity,
				totalAmount: r.totalAmount,
				currency: r.currency,
				status: r.status,
				createdAt: r.createdAt,
				confirmedAt: r.confirmedAt,
				eventTitle: event?.titleEn || '',
				sessionTitle: (session as any)?.titleEn || (session as any)?.title || '',
				sessionStartTime: session?.startTime?.toISOString() || '',
				paymentStatus: r.paymentStatus
			};
		});

		// Apply search filter if provided
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			reservations = reservations.filter(r =>
				r.guestName.toLowerCase().includes(query) ||
				r.guestEmail.toLowerCase().includes(query)
			);
		}

		return { reservations, searchQuery };
	}

	// Database mode - use actual database
	const { db } = await import('$lib/server/db');
	const { reservations } = await import('$lib/server/db/schema');
	const { desc } = await import('drizzle-orm');

	// Build where clause for search
	let whereClause = undefined;
	if (searchQuery) {
		const searchTerm = `%${searchQuery}%`;
		whereClause = or(
			ilike(reservations.guestName, searchTerm),
			ilike(reservations.guestEmail, searchTerm)
		);
	}

	const allReservations = await db.query.reservations.findMany({
		where: whereClause,
		orderBy: [desc(reservations.createdAt)],
		with: {
			eventSession: {
				with: {
					event: {
						columns: {
							titleEn: true,
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
		reservations: allReservations.map((r: typeof allReservations[number]) => ({
			id: r.id,
			guestName: r.guestName,
			guestEmail: r.guestEmail,
			quantity: r.quantity,
			totalAmount: r.totalAmount,
			currency: r.currency,
			status: r.status,
			createdAt: r.createdAt.toISOString(),
			confirmedAt: r.confirmedAt?.toISOString(),
			eventTitle: r.eventSession.event.titleEn,
			sessionTitle: r.eventSession.titleEn,
			sessionStartTime: r.eventSession.startTime.toISOString(),
			paymentStatus: r.payment?.status || 'none'
		})),
		searchQuery,
	};
};

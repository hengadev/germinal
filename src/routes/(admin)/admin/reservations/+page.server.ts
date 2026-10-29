import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';
import { or, ilike } from 'drizzle-orm';
import { seatingTitle } from '$lib/utils/seating-title';
import { requireAdmin } from '$lib/server/auth-guards';

export const load: PageServerLoad = async ({ url, locals }) => {
	// Carries Dietary Requirements (health data, issue 041): Admins only.
	requireAdmin(locals);
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
				// Mock rows carry no Deposit/Balance split: balance-due.ts treats
				// them as paid in full online (Deposit = total, Balance = 0).
				depositAmount: (r as { depositAmount?: number }).depositAmount ?? null,
				balanceAmount: (r as { balanceAmount?: number }).balanceAmount ?? null,
				currency: r.currency,
				status: r.status,
				createdAt: r.createdAt,
				confirmedAt: r.confirmedAt,
				eventTitle: event?.titleEn || '',
				seatingId: r.eventSessionId,
				sessionTitle: session && event ? seatingTitle(session, 'en', { timeZone: event.timeZone }) : '',
				sessionStartTime: session?.startTime?.toISOString() || '',
				paymentStatus: r.paymentStatus,
				isComp: (r as { isComp?: boolean }).isComp ?? false,
				// Dietary Requirements (issue 041): Admins only.
				dietaryRequirements: (r as { dietaryRequirements?: string | null }).dietaryRequirements ?? null
			};
		});

		// Apply search filter if provided
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			reservations = reservations.filter(r =>
				r.guestName.toLowerCase().includes(query) ||
				r.guestEmail?.toLowerCase().includes(query)
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
							timeZone: true
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
			depositAmount: r.depositAmount,
			balanceAmount: r.balanceAmount,
			currency: r.currency,
			status: r.status,
			createdAt: r.createdAt.toISOString(),
			confirmedAt: r.confirmedAt?.toISOString(),
			eventTitle: r.eventSession.event.titleEn,
			seatingId: r.eventSessionId,
			sessionTitle: seatingTitle(r.eventSession, 'en', { timeZone: r.eventSession.event.timeZone }),
			sessionStartTime: r.eventSession.startTime.toISOString(),
			paymentStatus: r.payment?.status || 'none',
			isComp: r.isComp,
			// Dietary Requirements (issue 041): Admins only.
			dietaryRequirements: r.dietaryRequirements
		})),
		searchQuery,
	};
};

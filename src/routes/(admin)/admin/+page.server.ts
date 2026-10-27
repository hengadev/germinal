import { DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS, MOCK_PAYMENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';
import { seatingTitle } from '$lib/utils/seating-title';

interface RecentBooking {
	id: string;
	guestName: string;
	eventTitle: string;
	sessionTitle: string;
	quantity: number;
	totalAmount: number;
	currency: string;
	confirmedAt: string;
}

interface UpcomingSession {
	id: string;
	eventTitle: string;
	sessionTitle: string;
	startTime: string;
	/** Null on a Seating without a limit (ADR 0009). */
	totalCapacity: number | null;
	/** Seats held by pending, processing and confirmed Reservations. */
	reservedSeats: number;
	/** Price per seat from the Seating's Service; null while not set. */
	priceAmount: number | null;
	currency: string;
}

interface DashboardStats {
	revenueThisWeek: number;
	ticketsThisWeek: number;
	upcomingSessionsCount: number;
	pendingReservationsCount: number;
}

async function getMockDashboardData() {
	const now = new Date();
	const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

	const recentPayments = MOCK_PAYMENTS.filter(
		(p) => p.status === 'succeeded' && new Date(p.createdAt) >= oneWeekAgo
	);
	const revenueThisWeek = recentPayments.reduce((sum, p) => sum + p.amount, 0);

	const recentConfirmed = MOCK_RESERVATIONS.filter(
		(r) => r.status === 'confirmed' && r.confirmedAt && new Date(r.confirmedAt) >= oneWeekAgo
	);
	const ticketsThisWeek = recentConfirmed.reduce((sum, r) => sum + r.quantity, 0);

	const upcomingAll = MOCK_SESSIONS.filter((s) => new Date(s.startTime) > now && s.published);
	const upcomingSessionsCount = upcomingAll.length;

	const pendingReservationsCount = MOCK_RESERVATIONS.filter(
		(r) => r.status === 'pending' || r.status === 'processing'
	).length;

	const confirmedReservations = MOCK_RESERVATIONS.filter(
		(r) => r.status === 'confirmed' && r.confirmedAt
	)
		.sort((a, b) => new Date(b.confirmedAt!).getTime() - new Date(a.confirmedAt!).getTime())
		.slice(0, 5);

	const recentBookings: RecentBooking[] = confirmedReservations.map((r) => {
		const session = MOCK_SESSIONS.find((s) => s.id === r.eventSessionId);
		const event = session ? MOCK_EVENTS.find((e) => e.id === session.eventId) : null;
		return {
			id: r.id,
			guestName: r.guestName,
			eventTitle: event?.titleEn ?? 'Unknown Event',
			sessionTitle: session ? seatingTitle(session, 'en', { timeZone: event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE }) : 'Unknown Session',
			quantity: r.quantity,
			totalAmount: r.totalAmount,
			currency: r.currency,
			confirmedAt: r.confirmedAt!
		};
	});

	const upcomingSessions: UpcomingSession[] = upcomingAll
		.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
		.slice(0, 3)
		.map((s) => {
			const event = MOCK_EVENTS.find((e) => e.id === s.eventId);
			return {
				id: s.id,
				eventTitle: event?.titleEn ?? 'Unknown Event',
				sessionTitle: seatingTitle(s, 'en', { timeZone: event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE }),
				startTime: new Date(s.startTime).toISOString(),
				totalCapacity: s.totalCapacity,
				reservedSeats: s.totalCapacity - s.availableCapacity,
				priceAmount: s.priceAmount,
				currency: s.currency
			};
		});

	return {
		stats: { revenueThisWeek, ticketsThisWeek, upcomingSessionsCount, pendingReservationsCount },
		recentBookings,
		upcomingSessions
	};
}

async function getDbDashboardData() {
	const { db } = await import('$lib/server/db');
	const { payments, reservations, eventSessions } = await import('$lib/server/db/schema');
	const { eq, and, gte, gt, or, desc, asc, inArray, sql } = await import('drizzle-orm');

	const now = new Date();
	const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

	const recentPayments = await db.query.payments.findMany({
		where: and(eq(payments.status, 'succeeded'), gte(payments.createdAt, oneWeekAgo))
	});
	const revenueThisWeek = recentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

	const recentConfirmed = await db.query.reservations.findMany({
		where: and(eq(reservations.status, 'confirmed'), gte(reservations.confirmedAt, oneWeekAgo))
	});
	const ticketsThisWeek = recentConfirmed.reduce((sum, r) => sum + r.quantity, 0);

	const upcomingAll = await db.query.eventSessions.findMany({
		where: and(eq(eventSessions.published, true), gt(eventSessions.startTime, now))
	});
	const upcomingSessionsCount = upcomingAll.length;

	const pendingList = await db.query.reservations.findMany({
		where: or(eq(reservations.status, 'pending'), eq(reservations.status, 'processing'))
	});
	const pendingReservationsCount = pendingList.length;

	const recentConfirmedDetailed = await db.query.reservations.findMany({
		where: eq(reservations.status, 'confirmed'),
		orderBy: [desc(reservations.confirmedAt)],
		limit: 5,
		with: {
			eventSession: {
				with: {
					event: { columns: { id: true, titleEn: true, timeZone: true } }
				}
			}
		}
	});

	const recentBookings: RecentBooking[] = recentConfirmedDetailed.map((r) => ({
		id: r.id,
		guestName: r.guestName,
		eventTitle: r.eventSession?.event?.titleEn ?? 'Unknown Event',
		sessionTitle: r.eventSession ? seatingTitle(r.eventSession, 'en', { timeZone: r.eventSession.event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE }) : 'Unknown Session',
		quantity: r.quantity,
		totalAmount: r.totalAmount,
		currency: r.currency,
		confirmedAt: r.confirmedAt?.toISOString() ?? r.createdAt.toISOString()
	}));

	const upcomingDetailed = await db.query.eventSessions.findMany({
		where: and(eq(eventSessions.published, true), gt(eventSessions.startTime, now)),
		orderBy: [asc(eventSessions.startTime)],
		limit: 3,
		with: {
			event: { columns: { id: true, titleEn: true, timeZone: true } }
		}
	});

	const { getSeatingPrices } = await import('$lib/server/services/service-pricing');
	const upcomingPrices = await getSeatingPrices(upcomingDetailed.map((s: (typeof upcomingDetailed)[number]) => s.id));

	// Counted from the Reservations: a Seating without a limit keeps no
	// available count to subtract from.
	const upcomingIds = upcomingDetailed.map((s: (typeof upcomingDetailed)[number]) => s.id);
	const reservedRows: { sessionId: string; seats: number }[] = upcomingIds.length > 0
		? await db.select({
				sessionId: reservations.eventSessionId,
				seats: sql<number>`(coalesce(sum(${reservations.quantity}), 0))::int`,
			})
			.from(reservations)
			.where(and(
				inArray(reservations.eventSessionId, upcomingIds),
				inArray(reservations.status, ['pending', 'processing', 'confirmed'])
			))
			.groupBy(reservations.eventSessionId)
		: [];
	const reservedBySession = new Map(reservedRows.map((row) => [row.sessionId, row.seats]));

	const upcomingSessions: UpcomingSession[] = upcomingDetailed.map((s) => ({
		id: s.id,
		eventTitle: (s as typeof s & { event: { titleEn: string } | null }).event?.titleEn ?? 'Unknown Event',
		sessionTitle: seatingTitle(s, 'en', {
			timeZone: (s as typeof s & { event: { timeZone: string } | null }).event?.timeZone ?? DEFAULT_EVENT_TIME_ZONE,
		}),
		startTime: s.startTime.toISOString(),
		totalCapacity: s.totalCapacity,
		reservedSeats: reservedBySession.get(s.id) ?? 0,
		priceAmount: upcomingPrices.get(s.id)?.amount ?? null,
		currency: upcomingPrices.get(s.id)?.currency ?? 'EUR'
	}));

	return {
		stats: { revenueThisWeek, ticketsThisWeek, upcomingSessionsCount, pendingReservationsCount },
		recentBookings,
		upcomingSessions
	};
}

export const load: PageServerLoad = async () => {
	const dashboard = env.USE_MOCK_DATA
		? await getMockDashboardData()
		: await getDbDashboardData();

	return dashboard;
};

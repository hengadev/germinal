import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS, MOCK_PAYMENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

type DateRange = '7d' | '30d' | '90d' | 'all';

interface AnalyticsMetrics {
	totalRevenue: number;
	totalPayments: number;
	successfulPayments: number;
	failedPayments: number;
	refundedPayments: number;
	partiallyRefundedPayments: number;
	pendingPayments: number;
	successRate: number;
	averageOrderValue: number;
	totalTicketsSold: number;
}

interface DailyRevenue {
	date: string;
	revenue: number;
	payments: number;
}

interface EventRevenue {
	eventId: string;
	eventTitle: string;
	revenue: number;
	ticketsSold: number;
	payments: number;
}

interface PaymentStatus {
	status: string;
	count: number;
	amount: number;
	percentage: number;
}

interface AnalyticsData {
	metrics: AnalyticsMetrics;
	dailyRevenue: DailyRevenue[];
	eventRevenue: EventRevenue[];
	paymentStatusBreakdown: PaymentStatus[];
}

function getDateRangeFilter(range: DateRange): Date | null {
	const now = new Date();
	switch (range) {
		case '7d':
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		case '30d':
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		case '90d':
			return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
		case 'all':
			return null;
	}
}

function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'EUR'
	}).format(amount / 100);
}

async function getMockAnalyticsData(range: DateRange): Promise<AnalyticsData> {
	const startDate = getDateRangeFilter(range);

	// Filter payments by date range
	const filteredPayments = MOCK_PAYMENTS.filter((p) => {
		if (!startDate) return true;
		return new Date(p.createdAt) >= startDate;
	});

	// Filter reservations by date range
	const filteredReservations = MOCK_RESERVATIONS.filter((r) => {
		if (!startDate) return true;
		return new Date(r.createdAt) >= startDate;
	});

	// Calculate metrics
	const successfulPayments = filteredPayments.filter((p) => p.status === 'succeeded');
	const failedPayments = filteredPayments.filter((p) => p.status === 'failed');
	const refundedPayments = filteredPayments.filter((p) => p.status === 'refunded');
	const partiallyRefundedPayments = filteredPayments.filter((p) => p.status === 'partially_refunded');
	const pendingPayments = filteredPayments.filter((p) => p.status === 'pending' || p.status === 'processing');

	const totalRevenue = successfulPayments.reduce((sum, p) => sum + p.amount, 0);
	const totalRefunds = refundedPayments.reduce((sum, p) => sum + p.amount, 0) +
		partiallyRefundedPayments.reduce((sum, p) => sum + (p.refundedAmount || 0), 0);
	const netRevenue = totalRevenue - totalRefunds;

	const metrics: AnalyticsMetrics = {
		totalRevenue: netRevenue,
		totalPayments: filteredPayments.length,
		successfulPayments: successfulPayments.length,
		failedPayments: failedPayments.length,
		refundedPayments: refundedPayments.length,
		partiallyRefundedPayments: partiallyRefundedPayments.length,
		pendingPayments: pendingPayments.length,
		successRate: filteredPayments.length > 0
			? (successfulPayments.length / filteredPayments.length) * 100
			: 0,
		averageOrderValue: successfulPayments.length > 0
			? totalRevenue / successfulPayments.length
			: 0,
		totalTicketsSold: filteredReservations
			.filter((r) => r.status === 'confirmed')
			.reduce((sum, r) => sum + r.quantity, 0)
	};

	// Calculate daily revenue
	const dailyMap = new Map<string, { revenue: number; payments: number }>();
	filteredPayments.forEach((p) => {
		if (p.status === 'succeeded') {
			const date = new Date(p.createdAt).toISOString().split('T')[0];
			const current = dailyMap.get(date) || { revenue: 0, payments: 0 };
			current.revenue += p.amount;
			current.payments += 1;
			dailyMap.set(date, current);
		}
	});

	const dailyRevenue: DailyRevenue[] = Array.from(dailyMap.entries())
		.map(([date, data]) => ({ date, ...data }))
		.sort((a, b) => a.date.localeCompare(b.date));

	// Calculate event revenue
	const eventMap = new Map<
		string,
		{ eventTitle: string; revenue: number; ticketsSold: number; payments: number }
	>();
	filteredReservations.forEach((r) => {
		if (r.status === 'confirmed') {
			const session = MOCK_SESSIONS.find((s) => s.id === r.eventSessionId);
			const event = session?.eventId ? MOCK_EVENTS.find((e) => e.id === session.eventId) : null;
			if (event) {
				const current = eventMap.get(event.id) || {
					eventTitle: (event as any).title || (event as any).titleEn || 'Unknown Event',
					revenue: 0,
					ticketsSold: 0,
					payments: 0
				};
				current.revenue += r.totalAmount;
				current.ticketsSold += r.quantity;
				current.payments += 1;
				eventMap.set(event.id, current);
			}
		}
	});

	const eventRevenue: EventRevenue[] = Array.from(eventMap.entries())
		.map(([eventId, data]) => ({ eventId, ...data }))
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 10);

	// Payment status breakdown
	const statusMap = new Map<string, { count: number; amount: number }>();
	filteredPayments.forEach((p) => {
		const current = statusMap.get(p.status) || { count: 0, amount: 0 };
		current.count += 1;
		current.amount += p.amount;
		statusMap.set(p.status, current);
	});

	const paymentStatusBreakdown: PaymentStatus[] = Array.from(statusMap.entries()).map(
		([status, data]) => ({
			status,
			count: data.count,
			amount: data.amount,
			percentage: filteredPayments.length > 0 ? (data.count / filteredPayments.length) * 100 : 0
		})
	);

	return {
		metrics,
		dailyRevenue,
		eventRevenue,
		paymentStatusBreakdown
	};
}

async function getDbAnalyticsData(range: DateRange): Promise<AnalyticsData> {
	const { db } = await import('$lib/server/db');
	const { payments, reservations, eventSessions, events } = await import('$lib/server/db/schema');
	const { sql, gte, and, eq } = await import('drizzle-orm');

	const startDate = getDateRangeFilter(range);

	// Build date filter condition
	const dateFilter = startDate ? gte(payments.createdAt, startDate) : undefined;

	// Get all payments in range
	const allPayments = await db.query.payments.findMany({
		where: dateFilter ? and(dateFilter) : undefined,
		with: {
			reservation: {
				with: {
					eventSession: {
						with: {
							event: {
								columns: {
									id: true,
									title: true
								}
							}
						}
					}
				}
			}
		}
	});

	// Calculate metrics
	const successfulPayments = allPayments.filter((p: typeof allPayments[number]) => p.status === 'succeeded');
	const failedPayments = allPayments.filter((p: typeof allPayments[number]) => p.status === 'failed');
	const refundedPayments = allPayments.filter((p: typeof allPayments[number]) => p.status === 'refunded');
	const partiallyRefundedPayments = allPayments.filter((p: typeof allPayments[number]) => p.status === 'partially_refunded');
	const pendingPayments = allPayments.filter((p: typeof allPayments[number]) => p.status === 'pending' || p.status === 'processing');

	const totalRevenue = successfulPayments.reduce((sum: number, p: typeof successfulPayments[number]) => sum + (p.amount || 0), 0);
	const totalRefunds =
		refundedPayments.reduce((sum: number, p: typeof refundedPayments[number]) => sum + (p.amount || 0), 0) +
		partiallyRefundedPayments.reduce((sum: number, p: typeof partiallyRefundedPayments[number]) => sum + (p.refundedAmount || 0), 0);
	const netRevenue = totalRevenue - totalRefunds;

	const metrics: AnalyticsMetrics = {
		totalRevenue: netRevenue,
		totalPayments: allPayments.length,
		successfulPayments: successfulPayments.length,
		failedPayments: failedPayments.length,
		refundedPayments: refundedPayments.length,
		partiallyRefundedPayments: partiallyRefundedPayments.length,
		pendingPayments: pendingPayments.length,
		successRate: allPayments.length > 0 ? (successfulPayments.length / allPayments.length) * 100 : 0,
		averageOrderValue: successfulPayments.length > 0 ? totalRevenue / successfulPayments.length : 0,
		totalTicketsSold: successfulPayments.reduce(
			(sum: number, p: typeof successfulPayments[number]) => sum + (p.reservation?.quantity || 0),
			0
		)
	};

	// Calculate daily revenue
	const dailyMap = new Map<string, { revenue: number; payments: number }>();
	successfulPayments.forEach((p: typeof successfulPayments[number]) => {
		const date = new Date(p.createdAt).toISOString().split('T')[0];
		const current = dailyMap.get(date) || { revenue: 0, payments: 0 };
		current.revenue += p.amount || 0;
		current.payments += 1;
		dailyMap.set(date, current);
	});

	const dailyRevenue: DailyRevenue[] = Array.from(dailyMap.entries())
		.map(([date, data]) => ({ date, ...data }))
		.sort((a, b) => a.date.localeCompare(b.date));

	// Calculate event revenue
	const eventMap = new Map<
		string,
		{ eventTitle: string; revenue: number; ticketsSold: number; payments: number }
	>();
	successfulPayments.forEach((p: typeof successfulPayments[number]) => {
		const event = p.reservation?.eventSession?.event;
		if (event) {
			const current = eventMap.get(event.id) || {
				eventTitle: event.title,
				revenue: 0,
				ticketsSold: 0,
				payments: 0
			};
			current.revenue += p.amount || 0;
			current.ticketsSold += p.reservation?.quantity || 0;
			current.payments += 1;
			eventMap.set(event.id, current);
		}
	});

	const eventRevenue: EventRevenue[] = Array.from(eventMap.entries())
		.map(([eventId, data]) => ({ eventId, ...data }))
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 10);

	// Payment status breakdown
	const statusMap = new Map<string, { count: number; amount: number }>();
	allPayments.forEach((p: typeof allPayments[number]) => {
		const current = statusMap.get(p.status) || { count: 0, amount: 0 };
		current.count += 1;
		current.amount += p.amount || 0;
		statusMap.set(p.status, current);
	});

	const paymentStatusBreakdown: PaymentStatus[] = Array.from(statusMap.entries()).map(
		([status, data]) => ({
			status,
			count: data.count,
			amount: data.amount,
			percentage: allPayments.length > 0 ? (data.count / allPayments.length) * 100 : 0
		})
	);

	return {
		metrics,
		dailyRevenue,
		eventRevenue,
		paymentStatusBreakdown
	};
}

export const load: PageServerLoad = async ({ url }) => {
	const range = (url.searchParams.get('range') as DateRange) || '30d';

	const data = env.USE_MOCK_DATA
		? await getMockAnalyticsData(range)
		: await getDbAnalyticsData(range);

	return {
		...data,
		range
	};
};

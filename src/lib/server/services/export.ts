import { db } from '../db';
import { reservations, payments, eventSessions, events, waitlist } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { format } from 'date-fns';

/**
 * Convert data to CSV format
 */
function arrayToCSV(data: Record<string, unknown>[], headers: string[]): string {
	const csvRows: string[] = [];

	// Add header row
	csvRows.push(headers.map(h => escapeCSV(h)).join(','));

	// Add data rows
	for (const row of data) {
		const values = headers.map(header => {
			const value = row[header];
			return escapeCSV(formatCellValue(value));
		});
		csvRows.push(values.join(','));
	}

	return csvRows.join('\n');
}

/**
 * Escape a value for CSV
 */
function escapeCSV(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/**
 * Format a cell value for CSV
 */
function formatCellValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return format(value, 'yyyy-MM-dd HH:mm:ss');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'number') return value.toString();
	return String(value);
}

/**
 * Export all reservations to CSV
 */
export async function exportReservationsToCSV(options: {
	limit?: number;
	status?: string;
	startDate?: Date;
	endDate?: Date;
} = {}) {
	const { limit = 1000, status, startDate, endDate } = options;

	let query = db.query.reservations.findMany({
		with: {
			eventSession: {
				with: {
					event: true,
				},
			},
			payment: true,
		},
		orderBy: [desc(reservations.createdAt)],
	}).limit(limit);

	// Apply filters
	if (status) {
		query = db.query.reservations.findMany({
			where: eq(reservations.status, status),
			with: {
				eventSession: {
					with: {
						event: true,
					},
				},
				payment: true,
			},
			orderBy: [desc(reservations.createdAt)],
		}).limit(limit);
	}

	const reservations_data = await query;

	const csvData = reservations_data.map(r => ({
		'Reservation ID': r.id,
		'Guest Name': r.guestName,
		'Guest Email': r.guestEmail,
		'Guest Phone': r.guestPhone || '',
		'Notification Preference': r.notificationPreference,
		'Quantity': r.quantity,
		'Total Amount': r.totalAmount / 100,
		'Currency': r.currency,
		'Status': r.status,
		'Event': r.eventSession.event.title,
		'Session': r.eventSession.title,
		'Session Start': r.eventSession.startTime,
		'Session End': r.eventSession.endTime,
		'Payment Status': r.payment?.status || '',
		'Payment Method': r.payment?.stripePaymentMethodId || '',
		'Confirmed At': r.confirmedAt,
		'Created At': r.createdAt,
	}));

	const headers = [
		'Reservation ID',
		'Guest Name',
		'Guest Email',
		'Guest Phone',
		'Notification Preference',
		'Quantity',
		'Total Amount',
		'Currency',
		'Status',
		'Event',
		'Session',
		'Session Start',
		'Session End',
		'Payment Status',
		'Payment Method',
		'Confirmed At',
		'Created At',
	];

	return arrayToCSV(csvData, headers);
}

/**
 * Export all payments to CSV
 */
export async function exportPaymentsToCSV(options: {
	limit?: number;
	status?: string;
	startDate?: Date;
	endDate?: Date;
} = {}) {
	const { limit = 1000, status } = options;

	let query = db.query.payments.findMany({
		with: {
			reservation: {
				with: {
					eventSession: {
						with: {
							event: true,
						},
					},
				},
			},
		},
		orderBy: [desc(payments.createdAt)],
	}).limit(limit);

	// Apply status filter
	if (status) {
		query = db.query.payments.findMany({
			where: eq(payments.status, status),
			with: {
				reservation: {
					with: {
						eventSession: {
							with: {
								event: true,
							},
						},
					},
				},
			},
			orderBy: [desc(payments.createdAt)],
		}).limit(limit);
	}

	const payments_data = await query;

	const csvData = payments_data.map(p => ({
		'Payment ID': p.id,
		'Reservation ID': p.reservationId,
		'Guest Email': p.reservation.guestEmail,
		'Guest Name': p.reservation.guestName,
		'Amount': p.amount / 100,
		'Currency': p.currency,
		'Status': p.status,
		'Refunded Amount': p.refundedAmount / 100,
		'Stripe Payment Intent ID': p.stripePaymentIntentId,
		'Stripe Charge ID': p.stripeChargeId || '',
		'Receipt URL': p.receiptUrl || '',
		'Created At': p.createdAt,
		'Webhook Processed At': p.webhookProcessedAt,
	}));

	const headers = [
		'Payment ID',
		'Reservation ID',
		'Guest Email',
		'Guest Name',
		'Amount',
		'Currency',
		'Status',
		'Refunded Amount',
		'Stripe Payment Intent ID',
		'Stripe Charge ID',
		'Receipt URL',
		'Created At',
		'Webhook Processed At',
	];

	return arrayToCSV(csvData, headers);
}

/**
 * Export waitlist to CSV
 */
export async function exportWaitlistToCSV(options: { limit?: number } = {}) {
	const { limit = 1000 } = options;

	const waitlist_data = await db.query.waitlist.findMany({
		with: {
			eventSession: {
				with: {
					event: true,
				},
			},
		},
		orderBy: [desc(waitlist.createdAt)],
	}).limit(limit);

	const csvData = waitlist_data.map(w => ({
		'Entry ID': w.id,
		'Name': w.name,
		'Email': w.email,
		'Phone': w.phone || '',
		'Notification Preference': w.notificationPreference,
		'Quantity': w.quantity,
		'Notified': w.notified,
		'Notified At': w.notifiedAt,
		'Expires At': w.expiresAt,
		'Event': w.eventSession.event.title,
		'Session': w.eventSession.title,
		'Session Start': w.eventSession.startTime,
		'Created At': w.createdAt,
	}));

	const headers = [
		'Entry ID',
		'Name',
		'Email',
		'Phone',
		'Notification Preference',
		'Quantity',
		'Notified',
		'Notified At',
		'Expires At',
		'Event',
		'Session',
		'Session Start',
		'Created At',
	];

	return arrayToCSV(csvData, headers);
}

/**
 * Export analytics summary to CSV
 */
export async function exportAnalyticsToCSV(options: {
	startDate?: Date;
	endDate?: Date;
} = {}) {
	// Get payment statistics
	const payments_data = await db.query.payments.findMany({
		where: options.startDate ? sql`${payments.createdAt} >= ${options.startDate}` : undefined,
	});

	const succeededPayments = payments_data.filter(p => p.status === 'succeeded');
	const totalRevenue = succeededPayments.reduce((sum, p) => sum + p.amount, 0);
	const totalTicketsSold = succeededPayments.reduce((sum, p) => sum + (p.reservation?.quantity || 0), 0);

	const csvData = [
		{
			'Metric': 'Total Revenue',
			'Value': formatCurrency(totalRevenue),
		},
		{
			'Metric': 'Total Payments',
			'Value': payments_data.length.toString(),
		},
		{
			'Metric': 'Successful Payments',
			'Value': succeededPayments.length.toString(),
		},
		{
			'Metric': 'Failed Payments',
			'Value': payments_data.filter(p => p.status === 'failed').length.toString(),
		},
		{
			'Metric': 'Refunded Payments',
			'Value': payments_data.filter(p => p.status === 'refunded' || p.status === 'partially_refunded').length.toString(),
		},
		{
			'Metric': 'Total Tickets Sold',
			'Value': totalTicketsSold.toString(),
		},
		{
			'Metric': 'Average Order Value',
			'Value': succeededPayments.length > 0 ? formatCurrency(totalRevenue / succeededPayments.length) : '€0.00',
		},
		{
			'Metric': 'Export Date',
			'Value': new Date().toISOString(),
		},
	];

	const headers = ['Metric', 'Value'];

	return arrayToCSV(csvData, headers);
}

function formatCurrency(cents: number): string {
	return `€${(cents / 100).toFixed(2)}`;
}

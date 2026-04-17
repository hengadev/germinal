import { text } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { exportReservationsToCSV, exportPaymentsToCSV, exportWaitlistToCSV, exportAnalyticsToCSV } from '$lib/server/services/export';
import { env } from '$lib/server/env';
import type { RequestHandler } from './$types';

/**
 * Export reservations to CSV
 */
export const GET: RequestHandler = async ({ url }) => {
	const status = url.searchParams.get('status');
	const limit = parseInt(url.searchParams.get('limit') || '1000');
	const search = url.searchParams.get('search') || undefined;

	try {
		const csv = await exportReservationsToCSV({
			limit,
			status: status || undefined,
			search,
		});

		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="reservations-${Date.now()}.csv"`,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Export reservations error');
		return text('Failed to export reservations', { status: 500 });
	}
};

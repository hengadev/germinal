import { text } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { exportPaymentsToCSV } from '$lib/server/services/export';
import type { RequestHandler } from './$types';

/**
 * Export payments to CSV
 */
export const GET: RequestHandler = async ({ url }) => {
	const status = url.searchParams.get('status');
	const limit = parseInt(url.searchParams.get('limit') || '1000');

	try {
		const csv = await exportPaymentsToCSV({
			limit,
			status: status || undefined,
		});

		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="payments-${Date.now()}.csv"`,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Export payments error');
		return text('Failed to export payments', { status: 500 });
	}
};

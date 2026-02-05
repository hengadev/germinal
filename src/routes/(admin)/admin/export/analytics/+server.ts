import { text } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { exportAnalyticsToCSV } from '$lib/server/services/export';
import type { RequestHandler } from './$types';

/**
 * Export analytics to CSV
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const csv = await exportAnalyticsToCSV();

		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="analytics-${Date.now()}.csv"`,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Export analytics error');
		return text('Failed to export analytics', { status: 500 });
	}
};

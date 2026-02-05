import { text } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { exportWaitlistToCSV } from '$lib/server/services/export';
import type { RequestHandler } from './$types';

/**
 * Export waitlist to CSV
 */
export const GET: RequestHandler = async ({ url }) => {
	const limit = parseInt(url.searchParams.get('limit') || '1000');

	try {
		const csv = await exportWaitlistToCSV({
			limit,
		});

		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="waitlist-${Date.now()}.csv"`,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Export waitlist error');
		return text('Failed to export waitlist', { status: 500 });
	}
};

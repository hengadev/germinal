import { text } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { exportSubscribersToCSV } from '$lib/server/services/export';
import { requireAdmin } from '$lib/server/auth-guards';
import type { RequestHandler } from './$types';

/**
 * Export newsletter subscribers to CSV (issue 052): confirmed, subscribed
 * rows only.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	requireAdmin(locals);
	const limit = parseInt(url.searchParams.get('limit') || '5000');

	try {
		const csv = await exportSubscribersToCSV({ limit });

		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="subscribers-${Date.now()}.csv"`,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Export subscribers error');
		return text('Failed to export subscribers', { status: 500 });
	}
};

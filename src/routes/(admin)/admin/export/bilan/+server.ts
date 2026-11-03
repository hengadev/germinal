import { text } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { exportBilanToCSV } from '$lib/server/services/export';
import { requireAdmin } from '$lib/server/auth-guards';
import type { RequestHandler } from './$types';

const PERIODS = ['3m', '12m', 'tout'] as const;

/**
 * Export the Admin Bilan page's table to CSV (issue 058), honouring the
 * same ?periode= filter as the page.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	requireAdmin(locals);
	const param = url.searchParams.get('periode') ?? '3m';
	const period = (PERIODS as readonly string[]).includes(param)
		? (param as (typeof PERIODS)[number])
		: '3m';

	try {
		const csv = await exportBilanToCSV(period);

		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="bilan-${period}-${Date.now()}.csv"`,
			},
		});
	} catch (error) {
		logger.error({ err: error }, 'Export bilan error');
		return text('Failed to export bilan', { status: 500 });
	}
};

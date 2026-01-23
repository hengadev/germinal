import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { processEventReminders } from '$lib/server/services/event-reminders';
import { env } from '$lib/server/env';
import type { RequestHandler } from './$types';

/**
 * Cron endpoint for processing event reminders
 * Should be called periodically (e.g., every hour)
 *
 * Secured with CRON_SECRET environment variable
 */
export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret for security
	const authHeader = request.headers.get('authorization');
	const urlSecret = new URL(request.url).searchParams.get('secret');

	const providedSecret = authHeader?.startsWith('Bearer ')
		? authHeader.slice(7)
		: urlSecret;

	if (providedSecret !== env.CRON_SECRET) {
		logger.warn('[Cron] Unauthorized attempt to access event-reminders endpoint');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	logger.info('[Cron] Processing event reminders');

	try {
		const result = await processEventReminders();

		logger.info({
			oneWeekSent: result.oneWeekSent,
			oneDaySent: result.oneDaySent,
			total: result.total
		}, '[Cron] Event reminders processed');

		return json({
			success: true,
			oneWeekSent: result.oneWeekSent,
			oneDaySent: result.oneDaySent,
			total: result.total
		});
	} catch (error) {
		logger.error('[Cron] Event reminders processing failed:', error);
		return json({ error: 'Processing failed' }, { status: 500 });
	}
};

/**
 * Also support POST for cron services that use POST
 */
export const POST = GET;

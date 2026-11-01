import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { moneyAlerts } from '$lib/server/services/money-alerts';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const alerts = await moneyAlerts();
	return {
		alerts: alerts.map((alert) => ({ ...alert, seatingStart: alert.seatingStart.toISOString() }))
	};
};

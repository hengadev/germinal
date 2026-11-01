import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getStaffUrl } from '$lib/server/hostname';
import { moneyAlertCounts } from '$lib/server/services/money-alerts';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// SECURITY: Admin routes only accessible from admin subdomain
	if (!locals.isAdminDomain) {
		throw error(404, 'Not Found');
	}

	// Block unauthenticated users
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Block non-admin users
	if (locals.user.role !== 'admin') {
		throw redirect(302, '/');
	}

	// Pass user to admin pages
	return {
		user: locals.user,
		csrfToken: locals.csrfToken,
		staffPortalUrl: getStaffUrl(url.hostname) + '/staff',
		// Issue 042: open money alerts, for the « À traiter » badge. Best-effort:
		// a failure must not take the whole back office down.
		moneyAlertsTotal: await moneyAlertCounts()
			.then((counts) => counts.total)
			.catch(() => 0)
	};
};

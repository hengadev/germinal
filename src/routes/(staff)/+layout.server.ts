import { redirect, error } from '@sveltejs/kit';
import { scanTargetsFor } from '$lib/server/services/staff-portal';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Staff routes only accessible from staff subdomain
	if (!locals.isStaffDomain) {
		throw error(404, 'Not Found');
	}

	// Block unauthenticated users
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Block non-staff/non-admin users (both can access staff routes)
	if (locals.user.role !== 'staff' && locals.user.role !== 'admin') {
		throw redirect(302, '/');
	}

	// The floating Scan button (issue 034): the Events whose Day is under
	// way and where the user may scan.
	const scanTargets = await scanTargetsFor(locals.user);

	// Pass user to staff pages
	return {
		user: locals.user,
		csrfToken: locals.csrfToken,
		scanTargets
	};
};

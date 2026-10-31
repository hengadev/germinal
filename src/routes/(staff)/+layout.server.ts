import { redirect, error } from '@sveltejs/kit';
import { scanTargetFor } from '$lib/server/services/staff-portal';
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

	// One tap to the Scanner (issue 031): the Event whose Day is under way
	// and where the user may scan.
	const scanHref = await scanTargetFor(locals.user);

	// Pass user to staff pages
	return {
		user: locals.user,
		csrfToken: locals.csrfToken,
		scanHref
	};
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { listStaffRoles, listAssignableStaffRoles } from '$lib/server/services/staff-roles';
import { isAppError } from '$lib/server/errors';

// GET /api/admin/staff-roles - all Staff Roles with usage counts;
// ?assignable=1 returns only the non-archived ones (for pickers).
export const GET: RequestHandler = async ({ locals, url }) => {
	requireAdmin(locals);

	try {
		const roles = url.searchParams.has('assignable')
			? (await listAssignableStaffRoles()).map((role) => ({ ...role, assignmentCount: 0 }))
			: await listStaffRoles();
		return json(roles);
	} catch (error) {
		console.error('Failed to list staff roles:', error);
		return json({ error: isAppError(error) ? error.message : 'Failed to list staff roles' }, { status: 500 });
	}
};

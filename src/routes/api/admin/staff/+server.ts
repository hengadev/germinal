import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { env } from '$lib/server/env';
import { isAppError } from '$lib/server/errors';

// GET /api/admin/staff - Get all users with the staff role
export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);

	if (env.USE_MOCK_DATA) {
		return json([]);
	}

	try {
		const { getAllStaff } = await import('$lib/server/services/event-staff');
		const staff = await getAllStaff();
		return json(staff);
	} catch (error) {
		console.error('Failed to get staff list:', error);
		return json({ error: isAppError(error) ? error.message : 'Failed to get staff list' }, { status: 500 });
	}
};

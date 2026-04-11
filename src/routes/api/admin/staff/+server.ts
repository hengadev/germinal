import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { getAllStaff } from '$lib/server/services/event-staff';

// GET /api/admin/staff - Get all users with the staff role
export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);

	try {
		const staff = await getAllStaff();
		return json(staff);
	} catch (error) {
		console.error('Failed to get staff list:', error);
		return json({ error: 'Failed to get staff list' }, { status: 500 });
	}
};

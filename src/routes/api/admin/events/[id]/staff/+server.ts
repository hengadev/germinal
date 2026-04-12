import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import {
	getStaffForEvent,
	assignStaff,
	getAllStaff,
	StaffAssignmentError,
} from '$lib/server/services/event-staff';

// GET /api/admin/events/[id]/staff - Get all staff assigned to an event
export const GET: RequestHandler = async ({ locals, params }) => {
	requireStaff(locals);

	try {
		const staff = await getStaffForEvent(params.id);
		return json(staff);
	} catch (error) {
		console.error('Failed to get staff for event:', error);
		return json({ error: error instanceof Error ? error.message : 'Failed to get staff' }, { status: 500 });
	}
};

// POST /api/admin/events/[id]/staff - Assign a staff member to an event
export const POST: RequestHandler = async ({ locals, params, request }) => {
	requireStaff(locals);

	try {
		const body = await request.json();
		const { userId, roleLabel } = body;

		if (!userId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		const staff = await assignStaff(params.id, userId, roleLabel);
		return json(staff, { status: 201 });
	} catch (error) {
		if (error instanceof StaffAssignmentError) {
			const status = error.code === 'ALREADY_ASSIGNED' ? 409
				: error.code === 'NOT_FOUND' ? 404
				: 400;
			return json({ error: error.message }, { status });
		}
		console.error('Failed to assign staff:', error);
		return json({ error: error instanceof Error ? error.message : 'Failed to assign staff' }, { status: 500 });
	}
};

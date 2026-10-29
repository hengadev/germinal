import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import {
	getStaffForEvent,
	assignStaff,
	changeAssignmentRole,
	adjustAssignmentPermissions,
	getAllStaff,
	StaffAssignmentError,
} from '$lib/server/services/event-staff';
import { isAppError } from '$lib/server/errors';
import { isStaffPermission } from '$lib/staff/permissions';

// GET /api/admin/events/[id]/staff - Get all staff assigned to an event
export const GET: RequestHandler = async ({ locals, params }) => {
	requireAdmin(locals);

	try {
		const staff = await getStaffForEvent(params.id);
		return json(staff);
	} catch (error) {
		console.error('Failed to get staff for event:', error);
		return json({ error: isAppError(error) ? error.message : 'Failed to get staff' }, { status: 500 });
	}
};

// POST /api/admin/events/[id]/staff - Assign a staff member to an event with a Staff Role
export const POST: RequestHandler = async ({ locals, params, request }) => {
	requireAdmin(locals);

	try {
		const body = await request.json();
		const { userId, staffRoleId } = body;

		if (!userId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}
		if (!staffRoleId) {
			return json({ error: 'Staff role ID is required' }, { status: 400 });
		}

		const staff = await assignStaff(params.id, userId, staffRoleId);
		return json(staff, { status: 201 });
	} catch (error) {
		if (error instanceof StaffAssignmentError) {
			const status = error.code === 'ALREADY_ASSIGNED' ? 409
				: error.code === 'NOT_FOUND' ? 404
				: error.code === 'ROLE_NOT_ASSIGNABLE' ? 409
				: 400;
			return json({ error: error.message }, { status });
		}
		console.error('Failed to assign staff:', error);
		return json({ error: isAppError(error) ? error.message : 'Failed to assign staff' }, { status: 500 });
	}
};

// PATCH /api/admin/events/[id]/staff - Change a staff member's Staff Role on an
// event ({ userId, staffRoleId }), or adjust an Assignment's permissions
// ({ userId, permissions }) — the exact ticked set, effective before the
// dependency closure (issue 014).
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	requireAdmin(locals);

	try {
		const body = await request.json();
		const { userId, staffRoleId, permissions } = body;

		if (!userId) {
			return json({ error: 'User ID is required' }, { status: 400 });
		}

		if (Array.isArray(permissions)) {
			if (!permissions.every(isStaffPermission)) {
				return json({ error: 'Unknown staff permission' }, { status: 400 });
			}
			await adjustAssignmentPermissions(params.id, userId, permissions);
			return json({ success: true });
		}

		if (!staffRoleId) {
			return json({ error: 'Staff role ID is required' }, { status: 400 });
		}

		await changeAssignmentRole(params.id, userId, staffRoleId);
		return json({ success: true });
	} catch (error) {
		if (error instanceof StaffAssignmentError) {
			const status = error.code === 'NOT_FOUND' ? 404
				: error.code === 'ROLE_NOT_ASSIGNABLE' ? 409
				: error.code === 'INVALID_PERMISSION' ? 400
				: 400;
			return json({ error: error.message }, { status });
		}
		console.error('Failed to change staff role:', error);
		return json({ error: isAppError(error) ? error.message : 'Failed to change staff role' }, { status: 500 });
	}
};

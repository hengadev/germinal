import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { removeStaff } from '$lib/server/services/event-staff';

// DELETE /api/admin/events/[id]/staff/[userId] - Remove a staff member from an event
export const DELETE: RequestHandler = async ({ locals, params }) => {
	requireStaff(locals);

	try {
		await removeStaff(params.id, params.userId);
		return json({ success: true });
	} catch (error) {
		console.error('Failed to remove staff:', error);
		return json({ error: 'Failed to remove staff' }, { status: 500 });
	}
};

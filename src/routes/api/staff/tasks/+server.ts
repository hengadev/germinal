import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { getTasksForUser } from '$lib/server/services/tasks';

// GET /api/staff/tasks - Get all tasks for the authenticated staff user
export const GET: RequestHandler = async ({ locals }) => {
	requireStaff(locals);

	if (!locals.user) {
		return json({ error: 'User not authenticated' }, { status: 401 });
	}

	try {
		const tasks = await getTasksForUser(locals.user.id);
		return json(tasks);
	} catch (error) {
		console.error('Failed to get tasks for user:', error);
		return json({ error: 'Failed to get tasks' }, { status: 500 });
	}
};

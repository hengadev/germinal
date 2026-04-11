import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { getTasksForEvent, getTaskSummary } from '$lib/server/services/tasks';

// GET /api/admin/events/[id]/tasks - Get all tasks for an event
export const GET: RequestHandler = async ({ locals, params }) => {
	requireStaff(locals);

	try {
		const tasks = await getTasksForEvent(params.id);
		const summary = await getTaskSummary(params.id);
		return json({ tasks, summary });
	} catch (error) {
		console.error('Failed to get tasks for event:', error);
		return json({ error: 'Failed to get tasks' }, { status: 500 });
	}
};

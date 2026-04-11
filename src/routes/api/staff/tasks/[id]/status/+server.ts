import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { updateTaskStatus, getTasksForUser } from '$lib/server/services/tasks';
import { eq } from 'drizzle-orm';
import { tasks } from '$lib/server/db/schema';

// PATCH /api/staff/tasks/[id]/status - Update task status (only for tasks assigned to current user)
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	requireStaff(locals);

	if (!locals.user) {
		return json({ error: 'User not authenticated' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { status } = body;

		if (!status) {
			return json({ error: 'Status is required' }, { status: 400 });
		}

		// Verify the task is assigned to this user
		const userTasks = await getTasksForUser(locals.user.id);
		const task = userTasks.find(t => t.id === params.id);

		if (!task) {
			return json({ error: 'Task not found or not assigned to you' }, { status: 404 });
		}

		const updatedTask = await updateTaskStatus(params.id, status);
		return json(updatedTask);
	} catch (error) {
		console.error('Failed to update task status:', error);
		return json({ error: 'Failed to update task status' }, { status: 500 });
	}
};

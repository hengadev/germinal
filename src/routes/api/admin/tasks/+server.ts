import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { createTask } from '$lib/server/services/tasks';

// POST /api/admin/tasks - Create a new task
export const POST: RequestHandler = async ({ locals, request }) => {
	requireStaff(locals);

	try {
		const body = await request.json();
		const { eventId, assignedTo, title, description, dueDate, priority } = body;

		if (!eventId || !title) {
			return json({ error: 'Event ID and title are required' }, { status: 400 });
		}

		if (!locals.user) {
			return json({ error: 'User not authenticated' }, { status: 401 });
		}

		const task = await createTask({
			eventId,
			assignedTo: assignedTo || null,
			createdBy: locals.user.id,
			title,
			description: description || null,
			dueDate: dueDate ? new Date(dueDate) : null,
			priority: priority || 'medium',
		});

		return json(task, { status: 201 });
	} catch (error) {
		console.error('Failed to create task:', error);
		return json({ error: error instanceof Error ? error.message : 'Failed to create task' }, { status: 500 });
	}
};

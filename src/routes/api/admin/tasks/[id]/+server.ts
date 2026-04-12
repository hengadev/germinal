import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { updateTask, deleteTask } from '$lib/server/services/tasks';
import { isAppError } from '$lib/server/errors';

// PUT /api/admin/tasks/[id] - Update a task
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	requireStaff(locals);

	try {
		const body = await request.json();
		const { title, description, dueDate, priority, status, assignedTo } = body;

		const updateData: any = {};
		if (title !== undefined) updateData.title = title;
		if (description !== undefined) updateData.description = description;
		if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
		if (priority !== undefined) updateData.priority = priority;
		if (status !== undefined) updateData.status = status;
		if (assignedTo !== undefined) updateData.assignedTo = assignedTo;

		const task = await updateTask(params.id, updateData);
		return json(task);
	} catch (error) {
		console.error('Failed to update task:', error);
		return json({ error: isAppError(error) ? error.message : 'Failed to update task' }, { status: 500 });
	}
};

// DELETE /api/admin/tasks/[id] - Delete a task
export const DELETE: RequestHandler = async ({ locals, params }) => {
	requireStaff(locals);

	try {
		await deleteTask(params.id);
		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete task:', error);
		return json({ error: isAppError(error) ? error.message : 'Failed to delete task' }, { status: 500 });
	}
};

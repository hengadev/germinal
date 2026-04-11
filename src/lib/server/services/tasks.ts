import { db } from '../db';
import { tasks, users, events } from '../db/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface CreateTaskInput {
	eventId: string;
	assignedTo?: string | null;
	createdBy: string;
	title: string;
	description?: string | null;
	dueDate?: Date | null;
	priority?: TaskPriority;
}

export interface TaskWithUser {
	id: string;
	eventId: string;
	assignedTo: string | null;
	createdBy: string;
	title: string;
	description: string | null;
	dueDate: Date | null;
	status: TaskStatus;
	priority: TaskPriority;
	createdAt: Date;
	updatedAt: Date;
	assignedToUser: {
		id: string;
		email: string;
		role: string;
	} | null;
}

export interface TaskWithEvent {
	id: string;
	eventId: string;
	assignedTo: string | null;
	createdBy: string;
	title: string;
	description: string | null;
	dueDate: Date | null;
	status: TaskStatus;
	priority: TaskPriority;
	createdAt: Date;
	updatedAt: Date;
	event: {
		id: string;
		titleEn: string;
		titleFr: string;
	};
}

/**
 * Create a new task
 */
export async function createTask(data: CreateTaskInput): Promise<TaskWithUser> {
	try {
		const [task] = await db
			.insert(tasks)
			.values({
				eventId: data.eventId,
				assignedTo: data.assignedTo || null,
				createdBy: data.createdBy,
				title: data.title,
				description: data.description || null,
				dueDate: data.dueDate || null,
				priority: data.priority || 'medium',
			})
			.returning();

		if (!task) {
			throw new Error('Failed to create task');
		}

		// Fetch the full record with assigned user
		const fullTask = await getTaskById(task.id);

		if (!fullTask) {
			throw new Error('Failed to retrieve created task');
		}

		logger.info(`Created task ${task.id} for event ${data.eventId}`);
		return fullTask;
	} catch (error) {
		logger.error({ err: error }, 'Failed to create task');
		throw error;
	}
}

/**
 * Update a task
 */
export async function updateTask(id: string, data: Partial<CreateTaskInput & { status: TaskStatus }>): Promise<TaskWithUser> {
	try {
		const { createdBy: _omit, ...fields } = data;
		const updateData: Partial<CreateTaskInput & { status: TaskStatus; updatedAt: Date }> = {
			...fields,
			updatedAt: new Date(),
		};

		const [task] = await db
			.update(tasks)
			.set(updateData)
			.where(eq(tasks.id, id))
			.returning();

		if (!task) {
			throw new Error('Task not found');
		}

		// Fetch the full record with assigned user
		const fullTask = await getTaskById(id);

		if (!fullTask) {
			throw new Error('Failed to retrieve updated task');
		}

		logger.info(`Updated task ${id}`);
		return fullTask;
	} catch (error) {
		logger.error({ err: error }, 'Failed to update task');
		throw error;
	}
}

/**
 * Delete a task
 */
export async function deleteTask(id: string): Promise<void> {
	try {
		await db.delete(tasks).where(eq(tasks.id, id));
		logger.info(`Deleted task ${id}`);
	} catch (error) {
		logger.error({ err: error }, 'Failed to delete task');
		throw error;
	}
}

/**
 * Get a task by ID with assigned user
 */
async function getTaskById(id: string): Promise<TaskWithUser | null> {
	try {
		const task = await db.query.tasks.findFirst({
			where: eq(tasks.id, id),
			with: {
				assignedTo: true,
			},
		});

		if (!task) {
			return null;
		}

		return {
			...task,
			assignedToUser: task.assignedTo ? {
				id: task.assignedTo.id,
				email: task.assignedTo.email,
				role: task.assignedTo.role,
			} : null,
		};
	} catch (error) {
		logger.error({ err: error }, 'Failed to get task by ID');
		throw error;
	}
}

/**
 * Get all tasks for an event
 */
export async function getTasksForEvent(eventId: string): Promise<TaskWithUser[]> {
	try {
		const tasksData = await db.query.tasks.findMany({
			where: eq(tasks.eventId, eventId),
			with: {
				assignedTo: true,
			},
			orderBy: [desc(tasks.createdAt)],
		});

		return tasksData.map(task => ({
			...task,
			assignedToUser: task.assignedTo ? {
				id: task.assignedTo.id,
				email: task.assignedTo.email,
				role: task.assignedTo.role,
			} : null,
		}));
	} catch (error) {
		logger.error({ err: error }, 'Failed to get tasks for event');
		throw error;
	}
}

/**
 * Get all tasks for a user
 */
export async function getTasksForUser(userId: string): Promise<TaskWithEvent[]> {
	try {
		const tasksData = await db.query.tasks.findMany({
			where: eq(tasks.assignedTo, userId),
			with: {
				event: true,
			},
			orderBy: [desc(tasks.createdAt)],
		});

		return tasksData.map(task => ({
			...task,
			event: {
				id: task.event.id,
				titleEn: task.event.titleEn,
				titleFr: task.event.titleFr,
			},
		}));
	} catch (error) {
		logger.error({ err: error }, 'Failed to get tasks for user');
		throw error;
	}
}

/**
 * Update task status
 */
export async function updateTaskStatus(id: string, status: TaskStatus): Promise<TaskWithUser> {
	return updateTask(id, { status });
}

/**
 * Get task summary for an event
 */
export async function getTaskSummary(eventId: string): Promise<{
	total: number;
	pending: number;
	inProgress: number;
	done: number;
}> {
	try {
		const rows = await db
			.select({
				status: tasks.status,
				count: count(),
			})
			.from(tasks)
			.where(eq(tasks.eventId, eventId))
			.groupBy(tasks.status);

		const summary = { total: 0, pending: 0, inProgress: 0, done: 0 };
		for (const row of rows) {
			const n = Number(row.count);
			summary.total += n;
			if (row.status === 'pending') summary.pending = n;
			else if (row.status === 'in_progress') summary.inProgress = n;
			else if (row.status === 'done') summary.done = n;
		}

		return summary;
	} catch (error) {
		logger.error({ err: error }, 'Failed to get task summary');
		throw error;
	}
}

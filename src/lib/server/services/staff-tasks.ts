/**
 * Mes tâches (issue 030): every Task assigned to the signed-in person,
 * grouped by Event for the `/staff/taches` page, and the one status
 * change it offers. The Tasks permission is resolved per Event on the
 * server, never trusted from the client.
 */
import { activeDay } from '$lib/staff/access';
import {
	getStaffEventAccess,
	listStaffEventsWithPermission,
	type StaffEventListItem,
	type StaffPortalEvent,
} from './staff-portal';
import { getTasksForUser, updateTaskStatus, type TaskStatus, type TaskWithEvent } from './tasks';

export interface TaskGroup {
	event: StaffPortalEvent;
	tasks: TaskWithEvent[];
}

/**
 * The user's Tasks grouped by Event: the Event whose Day is under way
 * first, then the remaining Events in list order (upcoming by date, then
 * past). Only Events where the user holds the Tasks permission and has at
 * least one Task there.
 */
export async function getTaskGroupsForUser(user: { id: string; role: string }): Promise<TaskGroup[]> {
	const [tasks, allowed] = await Promise.all([
		getTasksForUser(user.id),
		listStaffEventsWithPermission(user, 'tasks'),
	]);

	const byEvent = new Map<string, TaskWithEvent[]>();
	for (const task of tasks) {
		const list = byEvent.get(task.event.id) ?? [];
		list.push(task);
		byEvent.set(task.event.id, list);
	}

	// The list is upcoming-then-past; Events with a Day under way jump the queue.
	const now = new Date();
	const underWay = (item: StaffEventListItem) =>
		activeDay(item.days, item.event.timeZone, now) !== null;
	const active = allowed.filter(underWay);
	const rest = allowed.filter((item) => !underWay(item));

	return [...active, ...rest]
		.map((item) => ({ event: item.event, tasks: byEvent.get(item.event.id) ?? [] }))
		.filter((group) => group.tasks.length > 0);
}

export type UserTaskUpdate =
	| { ok: true }
	| { ok: false; status: number; error: string };

/**
 * Change the status of one of the user's own Tasks. The Task must be
 * assigned to them and they must still hold the Tasks permission at its
 * Event.
 */
export async function updateUserTaskStatus(
	user: { id: string; role: string },
	taskId: string,
	status: TaskStatus
): Promise<UserTaskUpdate> {
	// Only the person's own Tasks.
	const task = (await getTasksForUser(user.id)).find((t) => t.id === taskId);
	if (!task) return { ok: false, status: 404, error: 'Tâche introuvable.' };

	const access = await getStaffEventAccess(user, task.event.id);
	if (!access.can('tasks')) {
		return {
			ok: false,
			status: 403,
			error: "Vous n'avez pas la permission Tâches sur cet événement.",
		};
	}

	await updateTaskStatus(taskId, status);
	return { ok: true };
}

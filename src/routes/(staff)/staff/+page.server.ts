import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Get current user's events and tasks
	try {
		const { getEventsForStaff } = await import('$lib/server/services/event-staff');
		const { getTasksForUser } = await import('$lib/server/services/tasks');

		const [eventsData, tasksData] = await Promise.all([
			getEventsForStaff(locals.user.id),
			getTasksForUser(locals.user.id),
		]);

		// Calculate summary stats
		const now = new Date();
		const upcomingEvents = eventsData.filter(e => e.event.endDate >= now);

		const pendingTasks = tasksData.filter(t => t.status === 'pending');
		const completedTasks = tasksData.filter(t => t.status === 'done');

		// Group tasks by status
		const tasksByStatus = {
			pending: tasksData.filter(t => t.status === 'pending'),
			inProgress: tasksData.filter(t => t.status === 'in_progress'),
			done: tasksData.filter(t => t.status === 'done'),
		};

		// Group tasks by event
		const tasksByEvent = new Map<string, typeof tasksData>();
		for (const task of tasksData) {
			if (!tasksByEvent.has(task.eventId)) {
				tasksByEvent.set(task.eventId, []);
			}
			tasksByEvent.get(task.eventId)!.push(task);
		}

		return {
			user: locals.user,
			events: eventsData,
			tasks: tasksData,
			tasksByStatus,
			tasksByEvent: Object.fromEntries(tasksByEvent),
			summary: {
				totalEvents: eventsData.length,
				upcomingEvents: upcomingEvents.length,
				openTasks: pendingTasks.length + tasksByStatus.inProgress.length,
				completedTasks: completedTasks.length,
			},
		};
	} catch (err) {
		console.error('Failed to load staff dashboard:', err);
		// Return empty data on error
		return {
			user: locals.user,
			events: [],
			tasks: [],
			tasksByStatus: { pending: [], inProgress: [], done: [] },
			tasksByEvent: {},
			summary: {
				totalEvents: 0,
				upcomingEvents: 0,
				openTasks: 0,
				completedTasks: 0,
			},
		};
	}
};

import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getStaffEventAccess } from '$lib/server/services/staff-portal';
import { getDayGuestList } from '$lib/server/services/day-guest-list';
import { getTasksForUser, updateTaskStatus } from '$lib/server/services/tasks';
import { taskStatusEnum } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Non authentifié');

	const access = await getStaffEventAccess(locals.user, params.id);

	const canTasks = access.can('tasks');
	// Arrivées needs a visible Day and the guest list or Dietary Requirements.
	const canArrivees = access.can('guest_list') || access.can('dietary');
	return {
		access: {
			permissions: access.permissions,
			day: access.day,
			canSeeGuests: access.canSeeGuests,
			canTasks,
			canArrivees,
		},
		event: access.event,
		staffRoleName: access.staffRoleName,
		tasks: canTasks
			? (await getTasksForUser(locals.user.id)).filter((t) => t.event.id === params.id)
			: [],
		arrivees: canArrivees ? await getDayGuestList(access, params.id) : null,
	};
};

export const actions: Actions = {
	updateTaskStatus: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		// The Tasks permission is checked against Staff access, not trusted
		// from the client.
		const access = await getStaffEventAccess(locals.user, params.id);
		if (!access.can('tasks')) {
			return fail(403, { error: "Vous n'avez pas la permission Tâches sur cet événement." });
		}

		const formData = await request.formData();
		const taskId = formData.get('taskId');
		const status = formData.get('status');
		if (typeof taskId !== 'string' || typeof status !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}
		if (!(taskStatusEnum.enumValues as readonly string[]).includes(status)) {
			return fail(400, { error: 'Statut invalide.' });
		}

		// Only the person's own Tasks for this Event.
		const task = (await getTasksForUser(locals.user.id)).find(
			(t) => t.id === taskId && t.event.id === params.id
		);
		if (!task) {
			return fail(404, { error: 'Tâche introuvable.' });
		}

		await updateTaskStatus(taskId, status as (typeof taskStatusEnum.enumValues)[number]);
		return { success: true };
	},
};

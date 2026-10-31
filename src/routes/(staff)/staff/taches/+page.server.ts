import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getTaskGroupsForUser, updateUserTaskStatus } from '$lib/server/services/staff-tasks';
import { taskStatusEnum } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié');

	return { groups: await getTaskGroupsForUser(locals.user) };
};

export const actions: Actions = {
	updateTaskStatus: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Non authentifié' });

		const formData = await request.formData();
		const taskId = formData.get('taskId');
		const status = formData.get('status');
		if (typeof taskId !== 'string' || typeof status !== 'string') {
			return fail(400, { error: 'Requête invalide.' });
		}
		if (!(taskStatusEnum.enumValues as readonly string[]).includes(status)) {
			return fail(400, { error: 'Statut invalide.' });
		}

		const result = await updateUserTaskStatus(
			locals.user,
			taskId,
			status as (typeof taskStatusEnum.enumValues)[number]
		);
		if (!result.ok) return fail(result.status, { error: result.error });
		return { success: true };
	},
};

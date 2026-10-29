import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listStaffEvents } from '$lib/server/services/staff-portal';
import { activeDay } from '$lib/staff/access';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const assignments = await listStaffEvents(locals.user);

	// A Staff member whose Assignment has a Day happening now (per Staff
	// access) opens directly on that Event; an Admin always gets the list.
	if (locals.user.role !== 'admin') {
		const now = new Date();
		for (const item of assignments) {
			if (activeDay(item.days, item.event.timeZone, now) !== null) {
				throw redirect(302, `/staff/events/${item.event.id}`);
			}
		}
	}

	return { assignments };
};

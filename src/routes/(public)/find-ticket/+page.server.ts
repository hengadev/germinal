import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** « Retrouver mon billet » exists only while tickets are on sale, as « À venir » does. */
export const load: PageServerLoad = async ({ parent }) => {
	const { hasUpcomingEvents } = await parent();
	if (!hasUpcomingEvents) error(404, 'Not found');
};

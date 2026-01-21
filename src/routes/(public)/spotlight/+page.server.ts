import { error } from '@sveltejs/kit';
import { getSpotlightEvent } from '$lib/server/services/events';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const spotlightEvent = await getSpotlightEvent();

		// Returns null if no spotlight exists - page should handle fallback
		return {
			spotlightEvent
		};
	} catch (err) {
		console.error('Failed to fetch spotlight event:', err);
		throw error(500, 'Failed to load spotlight event');
	}
};

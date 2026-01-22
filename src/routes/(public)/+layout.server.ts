import type { LayoutServerLoad } from './$types';
import { getSpotlightEvent } from '$lib/server/services/events';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Check if spotlight event exists (for navigation)
	let hasSpotlightEvent = false;
	if (USE_MOCK_DATA) {
		hasSpotlightEvent = MOCK_EVENTS.some(e => e.isSpotlight);
	} else {
		try {
			const spotlightEvent = await getSpotlightEvent();
			hasSpotlightEvent = spotlightEvent !== null;
		} catch {
			hasSpotlightEvent = false;
		}
	}

	return {
		user: locals.user,
		isAdminDomain: locals.isAdminDomain,
		csrfToken: locals.csrfToken,
		hasSpotlightEvent
	};
};

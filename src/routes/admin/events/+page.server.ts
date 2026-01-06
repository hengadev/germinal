import type { PageServerLoad } from './$types';
import { env } from '$lib/server/env';
import { MOCK_EVENTS } from '$lib/mock-data';

export const load: PageServerLoad = async () => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return all events (published and unpublished)
		return {
			events: MOCK_EVENTS
		};
	}

	// Database mode - import and use actual database functions
	const { getAllEvents } = await import('$lib/server/services/events');
	const events = await getAllEvents(false); // false = get all, not just published

	return {
		events
	};
};

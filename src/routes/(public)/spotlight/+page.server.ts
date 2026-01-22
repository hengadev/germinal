import { error } from '@sveltejs/kit';
import { getSpotlightEvent } from '$lib/server/services/events';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Use mock data if enabled (no database required!)
	if (USE_MOCK_DATA) {
		const spotlightEvent = MOCK_EVENTS.find(e => e.isSpotlight) ?? null;
		if (spotlightEvent) {
			// Attach event sessions to the spotlight event
			const eventSessions = MOCK_SESSIONS.filter(s => s.eventId === spotlightEvent.id);
			return {
				spotlightEvent: {
					...spotlightEvent,
					eventSessions
				}
			};
		}
		return { spotlightEvent: null };
	}

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

import type { LayoutServerLoad } from './$types';
import { getSpotlightEvent, hasUpcomingEvents } from '$lib/server/services/events';
import { hasPublishedTalents } from '$lib/server/services/talents';
import { MOCK_EVENTS, MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { canBeSpotlight, isUpcoming } from '$lib/utils/event-access';

/** The mock Events' next published Seating still ahead, or null. */
function mockNextPublishedStart(e: (typeof MOCK_EVENTS)[number]): Date | null {
	const sessions = ((e as Record<string, unknown>).eventSessions ?? (e as Record<string, unknown>).sessions ?? []) as { published?: boolean; startTime?: unknown }[];
	const starts = sessions
		.filter((s) => s.published && s.startTime)
		.map((s) => new Date(s.startTime as string | Date))
		.filter((d) => d.getTime() > Date.now())
		.sort((a, b) => a.getTime() - b.getTime());
	return starts[0] ?? null;
}

export const load: LayoutServerLoad = async () => {
	// Check if spotlight event exists (for navigation)
	let hasSpotlightEvent = false;
	let upcomingEvents = false;
	let talentsPublished = false;
	if (USE_MOCK_DATA) {
		hasSpotlightEvent = MOCK_EVENTS.some(e => e.isSpotlight && canBeSpotlight(e));
		const now = new Date();
		upcomingEvents = MOCK_EVENTS.some(e => isUpcoming(e, mockNextPublishedStart(e), now));
		talentsPublished = MOCK_TALENTS.length > 0;
	} else {
		try {
			const spotlightEvent = await getSpotlightEvent();
			hasSpotlightEvent = spotlightEvent !== null;
			upcomingEvents = await hasUpcomingEvents();
			talentsPublished = await hasPublishedTalents();
		} catch {
			hasSpotlightEvent = false;
			upcomingEvents = false;
			talentsPublished = false;
		}
	}

	return {
		hasSpotlightEvent,
		hasUpcomingEvents: upcomingEvents,
		hasPublishedTalents: talentsPublished
	};
};

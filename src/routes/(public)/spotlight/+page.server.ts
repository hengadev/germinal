import { redirect } from '@sveltejs/kit';
import { getSpotlightEvent } from '$lib/server/services/events';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { canBeSpotlight } from '$lib/utils/event-access';
import type { PageServerLoad } from './$types';

/**
 * The Spotlight is one Event, and its page is that Event's page: the link
 * leads there. Without a Spotlight, this page says so and points to
 * « Projets ».
 */
export const load: PageServerLoad = async () => {
	const spotlightEvent = USE_MOCK_DATA
		? (MOCK_EVENTS.find((e) => e.isSpotlight && canBeSpotlight(e)) ?? null)
		: await getSpotlightEvent();
	if (spotlightEvent) redirect(307, `/events/${spotlightEvent.id}`);
	return {};
};

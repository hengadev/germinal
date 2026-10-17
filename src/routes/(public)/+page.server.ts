import { getAllEvents, getSpotlightEvent } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { getAllTalents } from '$lib/server/services/talents';
import { MOCK_EVENTS, MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { canBeSpotlight, isListed } from '$lib/utils/event-access';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';
import type { TalentWithMedia } from '$lib/types/talents';

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for events');
        return {
            // The gallery draws from the Portfolio (issue 044); the upcoming
            // event is the Spotlight, which the Portfolio never holds.
            events: MOCK_EVENTS.filter(isListed) as unknown as EventWithMedia[],
            spotlightEvent: (MOCK_EVENTS.find(e => e.isSpotlight && canBeSpotlight(e)) ?? null) as unknown as EventWithMedia | null,
            talents: MOCK_TALENTS as unknown as TalentWithMedia[],
            heroImage: null,
            heroVideo: null,
        };
    }

    const { getSiteSettings } = await import('$lib/server/services/site-settings');

    const [eventsResult, talentsResult, siteSettings, spotlightEvent] = await Promise.all([
        getAllEvents({ listedOnly: true }),
        getAllTalents({ publishedOnly: true }),
        getSiteSettings(),
        getSpotlightEvent(),
    ]);

    return {
        events: eventsResult.data as EventWithMedia[],
        talents: talentsResult.data as TalentWithMedia[],
        heroImage: siteSettings?.heroImage ?? null,
        heroVideo: siteSettings?.heroVideo ?? null,
        spotlightEvent,
    };
};

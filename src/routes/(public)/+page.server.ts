import { getAllEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { getAllTalents } from '$lib/server/services/talents';
import { MOCK_EVENTS, MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';
import type { TalentWithMedia } from '$lib/types/talents';

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for events');
        return {
            events: MOCK_EVENTS as unknown as EventWithMedia[],
            talents: MOCK_TALENTS as unknown as TalentWithMedia[],
            heroImage: null,
            heroVideo: null,
        };
    }

    const { getSiteSettings } = await import('$lib/server/services/site-settings');

    const [eventsResult, talentsResult, siteSettings] = await Promise.all([
        getAllEvents({ publishedOnly: true }),
        getAllTalents({ publishedOnly: true }),
        getSiteSettings(),
    ]);

    return {
        events: eventsResult.data as EventWithMedia[],
        talents: talentsResult.data as TalentWithMedia[],
        heroImage: siteSettings?.heroImage ?? null,
        heroVideo: siteSettings?.heroVideo ?? null,
    };
};

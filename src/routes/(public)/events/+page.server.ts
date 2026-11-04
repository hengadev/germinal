import { getAllEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { isListed } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';
import { withProjectCover } from '$lib/utils/event-photos';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';

// « Projets » is an index: every listed Event on one page.
const PROJECTS_LIMIT = 100;

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for events');
        return {
            events: MOCK_EVENTS.filter((e) => isListed(e) && !e.isSpotlight)
                .slice(0, PROJECTS_LIMIT)
                .map((e) => withProjectCover(withoutPracticalInfo(e))) as unknown as EventWithMedia[],
        };
    }

    const result = await getAllEvents({
        listedOnly: true,
        excludeSpotlight: true,
        page: 1,
        limit: PROJECTS_LIMIT,
    });

    return {
        events: result.data as EventWithMedia[],
    };
};

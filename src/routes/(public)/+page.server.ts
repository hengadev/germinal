import { getAllEvents } from '$lib/server/services/events';
import { getAllTalents } from '$lib/server/services/talents';
import { MOCK_EVENTS, MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        console.log('📦 Using mock data for events');
        return {
            events: MOCK_EVENTS,
            talents: MOCK_TALENTS,
        };
    }
    const [events, talents] = await Promise.all([
        getAllEvents(true),
        getAllTalents(true),
    ]);

    return {
        events,
        talents,
    };
};

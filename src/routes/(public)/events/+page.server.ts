import { getAllEvents } from '$lib/server/services/events';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        console.log('📦 Using mock data for events');
        return {
            events: MOCK_EVENTS,
        };
    }

    const events = await getAllEvents(true);

    return {
        events,
    };
};

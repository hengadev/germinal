import { getAllEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { calculatePagination, DEFAULT_LIMIT } from '$lib/utils/pagination';
import type { PageServerLoad } from './$types';

const INITIAL_PAGE_SIZE = 6;

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for events');
        const totalEvents = MOCK_EVENTS.length;
        const initialEvents = MOCK_EVENTS.slice(0, INITIAL_PAGE_SIZE);
        const pagination = calculatePagination(1, INITIAL_PAGE_SIZE, totalEvents);

        return {
            events: initialEvents,
            pagination,
        };
    }

    const result = await getAllEvents({ publishedOnly: true, page: 1, limit: INITIAL_PAGE_SIZE });

    return {
        events: result.data,
        pagination: result.pagination,
    };
};

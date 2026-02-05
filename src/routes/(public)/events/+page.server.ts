import { getAllEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { MOCK_EVENTS, MOCK_CATEGORIES, USE_MOCK_DATA } from '$lib/mock-data';
import { calculatePagination, DEFAULT_LIMIT } from '$lib/utils/pagination';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';

const INITIAL_PAGE_SIZE = 6;

export const load: PageServerLoad = async () => {
    // Load categories
    let categories;
    if (USE_MOCK_DATA) {
        categories = MOCK_CATEGORIES.filter(c => c.published);
    } else {
        const { getAllCategories } = await import('$lib/server/services/categories');
        categories = await getAllCategories({ publishedOnly: true });
    }

    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for events');
        const totalEvents = MOCK_EVENTS.length;
        const initialEvents = MOCK_EVENTS.slice(0, INITIAL_PAGE_SIZE) as unknown as EventWithMedia[];
        const pagination = calculatePagination(1, INITIAL_PAGE_SIZE, totalEvents);

        return {
            events: initialEvents,
            pagination,
            categories,
        };
    }

    const result = await getAllEvents({ publishedOnly: true, page: 1, limit: INITIAL_PAGE_SIZE });

    return {
        events: result.data as EventWithMedia[],
        pagination: result.pagination,
        categories,
    };
};

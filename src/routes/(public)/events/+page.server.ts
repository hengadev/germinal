import { getAllEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { MOCK_EVENTS, MOCK_CATEGORIES, USE_MOCK_DATA } from '$lib/mock-data';
import { calculatePagination, DEFAULT_LIMIT } from '$lib/utils/pagination';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';

const INITIAL_PAGE_SIZE = 6;

export const load: PageServerLoad = async ({ url }) => {
    // Get search query from URL
    const searchQuery = url.searchParams.get('q') || undefined;

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
        let filteredEvents = MOCK_EVENTS;

        // Apply search filter if provided
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredEvents = MOCK_EVENTS.filter(e =>
                e.titleEn.toLowerCase().includes(query) ||
                e.titleFr.toLowerCase().includes(query) ||
                e.descriptionEn.toLowerCase().includes(query) ||
                e.descriptionFr.toLowerCase().includes(query)
            );
        }

        const totalEvents = filteredEvents.length;
        const initialEvents = filteredEvents.slice(0, INITIAL_PAGE_SIZE) as unknown as EventWithMedia[];
        const pagination = calculatePagination(1, INITIAL_PAGE_SIZE, totalEvents);

        return {
            events: initialEvents,
            pagination,
            categories,
            searchQuery,
        };
    }

    const result = await getAllEvents({
        publishedOnly: true,
        page: 1,
        limit: INITIAL_PAGE_SIZE,
        search: searchQuery
    });

    return {
        events: result.data as EventWithMedia[],
        pagination: result.pagination,
        categories,
        searchQuery,
    };
};

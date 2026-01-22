import { getAllTalents } from '$lib/server/services/talents';
import { logger } from '$lib/server/logger';
import { MOCK_TALENTS, MOCK_TALENT_CATEGORIES, USE_MOCK_DATA } from '$lib/mock-data';
import { calculatePagination } from '$lib/utils/pagination';
import type { PageServerLoad } from './$types';

const INITIAL_PAGE_SIZE = 6;

export const load: PageServerLoad = async () => {
    // Load categories
    let categories;
    if (USE_MOCK_DATA) {
        categories = MOCK_TALENT_CATEGORIES.filter(c => c.published);
    } else {
        const { getAllTalentCategories } = await import('$lib/server/services/talent-categories');
        categories = await getAllTalentCategories({ publishedOnly: true });
    }

    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for talents');
        const totalTalents = MOCK_TALENTS.length;
        const initialTalents = MOCK_TALENTS.slice(0, INITIAL_PAGE_SIZE);
        const pagination = calculatePagination(1, INITIAL_PAGE_SIZE, totalTalents);

        return {
            talents: initialTalents,
            pagination,
            categories,
        };
    }

    const result = await getAllTalents({ publishedOnly: true, page: 1, limit: INITIAL_PAGE_SIZE });

    return {
        talents: result.data,
        pagination: result.pagination,
        categories,
    };
};

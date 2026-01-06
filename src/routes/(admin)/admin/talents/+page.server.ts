import type { PageServerLoad } from './$types';
import { env } from '$lib/server/env';
import { MOCK_TALENTS } from '$lib/mock-data';

export const load: PageServerLoad = async () => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return all talents (published and unpublished)
		return {
			talents: MOCK_TALENTS
		};
	}

	// Database mode - import and use actual database functions
	const { getAllTalents } = await import('$lib/server/services/talents');
	const talents = await getAllTalents(false); // false = get all, not just published

	return {
		talents
	};
};

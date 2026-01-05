import { getAllTalents } from '$lib/server/services/talents';
import { MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import type { PageServerLoad} from './$types';

export const load: PageServerLoad = async () => {
  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    console.log('📦 Using mock data for talents');
    return {
      talents: MOCK_TALENTS,
    };
  }

  const talents = await getAllTalents(true);

  return {
    talents,
  };
};

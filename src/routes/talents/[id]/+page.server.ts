import { getTalentById } from '$lib/server/services/talents';
import { MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const talent = MOCK_TALENTS.find((t) => t.id === params.id);
    if (!talent) {
      throw error(404, 'Talent not found');
    }
    return { talent };
  }

  try {
    const talent = await getTalentById(params.id);

    return {
      talent,
    };
  } catch {
    throw error(404, 'Talent not found');
  }
};

import { getTalentById } from '$lib/server/services/talents';
import { MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { error } from '@sveltejs/kit';
import { viewerOf } from '$lib/utils/event-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  // An unpublished Talent is visible to the Admin only; anyone else gets 404.
  const isAdmin = viewerOf(locals.user).role === 'admin';

  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const talent = MOCK_TALENTS.find((t) => t.id === params.id);
    if (!talent || (!talent.published && !isAdmin)) {
      throw error(404, 'Talent not found');
    }
    return { talent };
  }

  let talent;
  try {
    talent = await getTalentById(params.id);
  } catch {
    throw error(404, 'Talent not found');
  }
  if (!talent.published && !isAdmin) {
    throw error(404, 'Talent not found');
  }

  return {
    talent,
  };
};

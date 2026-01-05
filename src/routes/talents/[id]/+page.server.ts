import { getTalentById } from '$lib/server/services/talents';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  try {
    const talent = await getTalentById(params.id);

    return {
      talent,
    };
  } catch {
    throw error(404, 'Talent not found');
  }
};

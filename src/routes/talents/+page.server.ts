import { getAllTalents } from '$lib/server/services/talents';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const talents = await getAllTalents(true);

  return {
    talents,
  };
};

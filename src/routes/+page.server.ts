import { getAllEvents } from '$lib/server/services/events';
import { getAllTalents } from '$lib/server/services/talents';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [events, talents] = await Promise.all([
    getAllEvents(true),
    getAllTalents(true),
  ]);

  return {
    events,
    talents,
  };
};

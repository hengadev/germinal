import { getAllEvents } from '$lib/server/services/events';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const events = await getAllEvents(true);

  return {
    events,
  };
};

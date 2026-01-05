import { getEventBySlug } from '$lib/server/services/events';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const event = MOCK_EVENTS.find((e) => e.slug === params.slug);
    if (!event) {
      throw error(404, 'Event not found');
    }
    return { event };
  }

  try {
    const event = await getEventBySlug(params.slug);

    return {
      event,
    };
  } catch {
    throw error(404, 'Event not found');
  }
};

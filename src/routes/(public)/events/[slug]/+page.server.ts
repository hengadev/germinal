import { getEventBySlug } from '$lib/server/services/events';
import { getPublishedSessionsByEventId } from '$lib/server/services/event-sessions';
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
    return { event, sessions: [] };
  }

  try {
    const event = await getEventBySlug(params.slug);
    const sessions = await getPublishedSessionsByEventId(event.id);

    return {
      event,
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        priceAmount: s.priceAmount,
        currency: s.currency,
        availableCapacity: s.availableCapacity,
        totalCapacity: s.totalCapacity,
        allowWaitlist: s.allowWaitlist,
        soldOut: s.availableCapacity === 0
      }))
    };
  } catch {
    throw error(404, 'Event not found');
  }
};

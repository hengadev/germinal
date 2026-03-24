import { getEventBySlug } from '$lib/server/services/events';
import { getPublishedSessionsByEventId } from '$lib/server/services/event-sessions';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const event = MOCK_EVENTS.find((e) => e.slug === params.slug);
    if (!event) {
      throw error(404, 'Event not found');
    }
    const sessions = MOCK_SESSIONS
      .filter((s) => s.eventId === event.id && s.published)
      .map((s) => ({
        id: s.id,
        title: s.title,
        titleEn: (s as any).titleEn,
        titleFr: (s as any).titleFr,
        description: s.description ?? null,
        descriptionEn: (s as any).descriptionEn ?? null,
        descriptionFr: (s as any).descriptionFr ?? null,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        priceAmount: s.priceAmount,
        currency: s.currency,
        availableCapacity: s.availableCapacity,
        totalCapacity: s.totalCapacity,
        allowWaitlist: s.allowWaitlist,
        badgeType: (s as any).badgeType ?? 'none',
        soldOut: s.availableCapacity === 0,
        isPast: s.startTime < new Date()
      }));
    return { event, sessions };
  }

  try {
    const event = await getEventBySlug(params.slug);
    const sessions = await getPublishedSessionsByEventId(event.id);

    return {
      event,
      sessions: sessions.map((s: typeof sessions[number]) => ({
        id: s.id,
        title: s.title,
        titleEn: (s as any).titleEn ?? null,
        titleFr: (s as any).titleFr ?? null,
        description: s.description,
        descriptionEn: (s as any).descriptionEn ?? null,
        descriptionFr: (s as any).descriptionFr ?? null,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        priceAmount: s.priceAmount,
        currency: s.currency,
        availableCapacity: s.availableCapacity,
        totalCapacity: s.totalCapacity,
        allowWaitlist: s.allowWaitlist,
        badgeType: s.badgeType ?? 'none',
        soldOut: s.availableCapacity === 0,
        isPast: s.startTime < new Date()
      }))
    };
  } catch {
    throw error(404, 'Event not found');
  }
};

import { getEventBySlug } from '$lib/server/services/events';
import { getPublishedScheduleByEventId, classifyServiceKind, utcDayKey, groupScheduleByDayAndService } from '$lib/server/services/event-schedule';
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
    const rows = MOCK_SESSIONS
      .filter((s) => s.eventId === event.id && s.published)
      .map((s) => ({
        dayDate: utcDayKey(s.startTime),
        serviceKind: classifyServiceKind(s.startTime),
        item: {
          id: s.id,
          titleEn: (s as any).titleEn || s.title,
          titleFr: (s as any).titleFr || s.title,
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
        }
      }));
    const schedule = groupScheduleByDayAndService(rows).map((day) => ({
      date: day.date,
      services: day.services.map((service) => ({
        kind: service.kind,
        sessions: service.items
      }))
    }));
    return {
      event,
      schedule,
      sessions: rows.map((row) => row.item)
    };
  }

  try {
    const event = await getEventBySlug(params.slug);
    const scheduleRows = await getPublishedScheduleByEventId(event.id);

    const rows = scheduleRows.map((row) => ({
      dayDate: row.dayDate,
      serviceKind: row.serviceKind,
      item: {
        id: row.item.id,
        titleEn: row.item.titleEn,
        titleFr: row.item.titleFr,
        descriptionEn: row.item.descriptionEn ?? null,
        descriptionFr: row.item.descriptionFr ?? null,
        startTime: row.item.startTime.toISOString(),
        endTime: row.item.endTime.toISOString(),
        priceAmount: row.item.priceAmount,
        currency: row.item.currency,
        availableCapacity: row.item.availableCapacity,
        totalCapacity: row.item.totalCapacity,
        allowWaitlist: row.item.allowWaitlist,
        badgeType: row.item.badgeType ?? 'none',
        soldOut: row.item.availableCapacity === 0,
        isPast: row.item.startTime < new Date()
      }
    }));

    const schedule = groupScheduleByDayAndService(rows).map((day) => ({
      date: day.date,
      services: day.services.map((service) => ({
        kind: service.kind,
        sessions: service.items
      }))
    }));

    return {
      event,
      schedule,
      sessions: rows.map((row) => row.item)
    };
  } catch {
    throw error(404, 'Event not found');
  }
};

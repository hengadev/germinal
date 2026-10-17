import { getEventBySlug } from '$lib/server/services/events';
import { getPublishedScheduleByEventId, classifyServiceKind, utcDayKey, groupScheduleByDayAndService } from '$lib/server/services/event-schedule';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import { getServiceOffersByEventId } from '$lib/server/services/service-pricing';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';
import type { ServiceKind } from '$lib/utils/seating-times';
import { toAccessEvent, toAccessSeating } from '$lib/server/services/event-access';
import { eventAccess, seatingAvailability, viewerOf } from '$lib/utils/event-access';

/** What a Service offers on the public page (issue 022): its Menu and the
 * price per guest, shown once per Service rather than on every Seating. */
interface ServiceOffer {
  menu: {
    nameEn: string;
    nameFr: string;
    descriptionEn: string | null;
    descriptionFr: string | null;
  } | null;
  /** Minor units; null while the price is not announced yet. */
  priceAmount: number | null;
  currency: string;
}

interface SeatingCard {
  id: string;
  serviceId: string;
  /** Unit price the Seating is booked at, null while not set. */
  priceAmount: number | null;
  currency: string;
  [key: string]: unknown;
}

/**
 * Days → Services → Seatings for the page. A Seating's own price is only
 * flagged (`ownPrice`) when it differs from its Service's — a Seating
 * migrated with a legacy price — so the page shows it next to that Seating.
 */
function buildSchedule<T extends SeatingCard>(
  rows: { dayDate: string; serviceKind: ServiceKind; item: T }[],
  offerOf: (serviceId: string, items: T[]) => ServiceOffer
) {
  return groupScheduleByDayAndService(rows).map((day) => ({
    date: day.date,
    services: day.services.map((service) => {
      const offer = offerOf(service.items[0].serviceId, service.items);
      return {
        kind: service.kind,
        ...offer,
        sessions: service.items.map((item) => ({
          ...item,
          ownPrice: item.priceAmount !== offer.priceAmount || item.currency !== offer.currency,
        })),
      };
    }),
  }));
}

export const load: PageServerLoad = async ({ params, locals }) => {
  const viewer = viewerOf(locals.user);
  const now = new Date();

  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const event = MOCK_EVENTS.find((e) => e.slug === params.slug);
    if (!event || !eventAccess(event, viewer).visible) {
      throw error(404, 'Event not found');
    }
    const rows = MOCK_SESSIONS
      .filter((s) => s.eventId === event.id && s.published)
      .map((s) => ({
        dayDate: utcDayKey(s.startTime),
        serviceKind: classifyServiceKind(s.startTime),
        item: {
          id: s.id,
          // Mock mode has no Services table: one synthetic Service per Day and meal.
          serviceId: `${utcDayKey(s.startTime)}:${classifyServiceKind(s.startTime)}`,
          ...seatingTitlesWithFallback(s),
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
          isPast: s.startTime < now,
          ...seatingAvailability({
            event,
            seating: toAccessSeating(s, s.priceAmount === null ? null : { amount: s.priceAmount, currency: s.currency, legacy: false }),
            viewer,
            now,
          }),
        }
      }));
    // Mock Services have no Menu; their price is their first Seating's.
    const schedule = buildSchedule(rows, (_serviceId, items) => ({
      menu: null,
      priceAmount: items[0].priceAmount,
      currency: items[0].currency,
    }));
    return {
      event,
      schedule,
      sessions: rows.map((row) => row.item)
    };
  }

  let event;
  try {
    event = await getEventBySlug(params.slug);
  } catch {
    throw error(404, 'Event not found');
  }
  // Event access (issue 030): an Event the viewer may not see is not found.
  const accessEvent = toAccessEvent(event);
  if (!eventAccess(accessEvent, viewer).visible) {
    throw error(404, 'Event not found');
  }

  try {
    const scheduleRows = await getPublishedScheduleByEventId(event.id);
    const offers = await getServiceOffersByEventId(event.id);

    const rows = scheduleRows.map((row) => ({
      dayDate: row.dayDate,
      serviceKind: row.serviceKind,
      item: {
        id: row.item.id,
        serviceId: row.item.serviceId,
        titleEn: row.item.titleEn,
        titleFr: row.item.titleFr,
        descriptionEn: row.item.descriptionEn ?? null,
        descriptionFr: row.item.descriptionFr ?? null,
        startTime: row.item.startTime.toISOString(),
        endTime: row.item.endTime.toISOString(),
        priceAmount: row.item.price?.amount ?? null,
        currency: row.item.price?.currency ?? offers.get(row.item.serviceId)?.currency ?? 'EUR',
        availableCapacity: row.item.availableCapacity,
        totalCapacity: row.item.totalCapacity,
        allowWaitlist: row.item.allowWaitlist,
        badgeType: row.item.badgeType ?? 'none',
        soldOut: row.item.availableCapacity === 0,
        isPast: row.item.startTime < now,
        // Why it cannot be booked (e.g. its Service has no price yet), and
        // whether its Waitlist is open — as Event access decides.
        ...seatingAvailability({
          event: accessEvent,
          seating: toAccessSeating(row.item, row.item.price),
          viewer,
          now,
        }),
      }
    }));

    const schedule = buildSchedule(rows, (serviceId) => {
      const offer = offers.get(serviceId);
      return {
        menu: offer?.menu ?? null,
        priceAmount: offer?.priceAmount ?? null,
        currency: offer?.currency ?? 'EUR',
      };
    });

    return {
      event,
      schedule,
      sessions: rows.map((row) => row.item)
    };
  } catch {
    throw error(404, 'Event not found');
  }
};

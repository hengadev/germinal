import { getAllEvents, getEventById } from '$lib/server/services/events';
import { getPublishedScheduleByEventId, groupScheduleByDayAndService } from '$lib/server/services/event-schedule';
import { dayOf, serviceKindOf } from '$lib/utils/event-time';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import { getServiceOffersByEventId } from '$lib/server/services/service-pricing';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';
import type { ServiceKind } from '$lib/utils/seating-times';
import type { MenuCourse } from '$lib/types/pricing-editor';
import { toAccessEvent, toAccessSeating } from '$lib/server/services/event-access';
import { eventAccess, isIndexed, seatingAvailability, viewerOf, type AccessEvent } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';
import { eventPhotosOf, projectCover, visualsOf } from '$lib/utils/event-photos';

/**
 * A Portfolio Event's page is its project (issue 045, ADR 0007): the
 * Recap, the Event Photos, credits, dates and venue. It leaves without the
 * announcement texts, Visuals, Seatings and prices, which the project page
 * never shows.
 */
function projectPage<E extends {
  media?: { id: string; role?: 'visual' | 'event_photo' | null; isCover?: boolean | null }[] | null;
  coverMedia?: { id: string } | null;
}>(event: E, days: string[]) {
  const {
    descriptionEn: _descriptionEn,
    descriptionFr: _descriptionFr,
    subtitleEn: _subtitleEn,
    subtitleFr: _subtitleFr,
    admissionInfoEn: _admissionInfoEn,
    admissionInfoFr: _admissionInfoFr,
    timings: _timings,
    media,
    coverMedia,
    coverVideo: _coverVideo,
    ...rest
  } = event as E & Record<string, unknown>;
  const photos = eventPhotosOf(media);
  return {
    project: {
      ...(rest as Omit<E, 'media' | 'coverMedia' | 'coverVideo'>),
      // The project cover: the Event Photos' cover, else the Visual one.
      cover: projectCover({ media, coverMedia }) as NonNullable<E['media']>[number] | E['coverMedia'] | null,
      eventPhotos: photos as NonNullable<E['media']>,
      days,
    },
  };
}

/** The Event as its announcement shows it: with its Visuals only, never
 * its Event Photos (issue 045). */
function onlyVisuals<E extends { media?: { id: string; role?: 'visual' | 'event_photo' | null }[] | null }>(event: E): E {
  return { ...event, media: visualsOf(event.media) };
}

/** The Event's Days (`YYYY-MM-DD`), first to last. */
async function eventDaysOf(eventId: string): Promise<string[]> {
  const { db } = await import('$lib/server/db');
  const { eventDays } = await import('$lib/server/db/schema');
  const { asc, eq, sql } = await import('drizzle-orm');
  const rows: { date: string }[] = await db
    .select({ date: sql<string>`${eventDays.date}::text` })
    .from(eventDays)
    .where(eq(eventDays.eventId, eventId))
    .orderBy(asc(eventDays.date));
  return rows.map((row) => row.date);
}

// « Projets » lists every project on one page.
const PROJECTS_LIMIT = 100;

/**
 * The project listed after this one on « Projets », wrapping to the first,
 * for the project page's « Projet suivant ». Null without another project.
 */
async function nextProjectOf(eventId: string) {
  const { data } = await getAllEvents({ listedOnly: true, portfolioOnly: true, page: 1, limit: PROJECTS_LIMIT });
  const projects = data as EventWithMedia[];
  if (projects.length < 2) return null;
  const index = projects.findIndex((e) => e.id === eventId);
  const next = projects[(index + 1) % projects.length];
  return {
    id: next.id,
    titleEn: next.titleEn,
    titleFr: next.titleFr,
  };
}

/**
 * A Private Event's page is reachable by its link but never indexed
 * (issue 032): it answers with `X-Robots-Tag: noindex`, and the page adds
 * the matching robots meta from `indexed`.
 */
function robots(event: AccessEvent, setHeaders: (headers: Record<string, string>) => void): boolean {
  const indexed = isIndexed(event);
  if (!indexed) setHeaders({ 'X-Robots-Tag': 'noindex' });
  return indexed;
}

/** What a Service offers on the public page (issue 022): its Menu and the
 * price per guest, shown once per Service rather than on every Seating. */
interface ServiceOffer {
  menu: {
    nameEn: string;
    nameFr: string;
    courses: MenuCourse[];
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

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  const viewer = viewerOf(locals.user);
  const now = new Date();

  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const event = MOCK_EVENTS.find((e) => e.id === params.id);
    const access = event && eventAccess(event, viewer);
    if (!event || !access?.visible) {
      throw error(404, 'Event not found');
    }
    const view = access.view;
    const indexed = robots(event, setHeaders);
    if (view === 'portfolio') {
      const days = [...new Set(MOCK_SESSIONS.filter((s) => s.eventId === event.id).map((s) => dayOf(s.startTime, event.timeZone)))].sort();
      return { view, indexed, ...projectPage(withoutPracticalInfo(event), days), event: null, schedule: [], sessions: [] };
    }
    const rows = MOCK_SESSIONS
      .filter((s) => s.eventId === event.id && s.published)
      .map((s) => ({
        dayDate: dayOf(s.startTime, event.timeZone),
        serviceKind: serviceKindOf(s.startTime, event.timeZone),
        item: {
          id: s.id,
          // Mock mode has no Services table: one synthetic Service per Day and meal.
          serviceId: `${dayOf(s.startTime, event.timeZone)}:${serviceKindOf(s.startTime, event.timeZone)}`,
          ...seatingTitlesWithFallback(s, { timeZone: event.timeZone }),
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
      project: null,
      // The public page never carries Practical Info (issue 040), and the
      // announcement shows only the Visuals (issue 045).
      event: onlyVisuals(withoutPracticalInfo(event)),
      indexed,
      schedule,
      sessions: rows.map((row) => row.item),
      // Which page this is: the announcement, or the Admin preview of a
      // Draft (issue 033) — the banner and disabled booking hang off it.
      view,
    };
  }

  let event;
  try {
    event = await getEventById(params.id);
  } catch {
    throw error(404, 'Event not found');
  }
  // Event access (issue 030): an Event the viewer may not see is not found.
  const accessEvent = toAccessEvent(event);
  const access = eventAccess(accessEvent, viewer);
  if (!access.visible) {
    throw error(404, 'Event not found');
  }
  const indexed = robots(accessEvent, setHeaders);

  if (access.view === 'portfolio') {
    // No Seatings, prices or booking on a project page (issue 045).
    const days = await eventDaysOf(event.id);
    const page = projectPage(withoutPracticalInfo(event), days);
    return { view: access.view, indexed, project: { ...page.project, next: await nextProjectOf(event.id) }, event: null, schedule: [], sessions: [] };
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
      project: null,
      // The public page never carries Practical Info (issue 040) — not even
      // for the Admin previewing a Draft — and the announcement shows only
      // the Visuals, never the Event Photos (issue 045).
      event: onlyVisuals(withoutPracticalInfo(event)),
      indexed,
      schedule,
      sessions: rows.map((row) => row.item),
      // Which page this is: the announcement, or the Admin preview of a
      // Draft (issue 033) — the banner and disabled booking hang off it.
      view: access.view
    };
  } catch {
    throw error(404, 'Event not found');
  }
};

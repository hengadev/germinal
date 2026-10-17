import { db } from '../db';
import { events, media, eventSessions, eventDays } from '../db/schema';
import { eq, desc, and, isNull, sql, or, ilike } from 'drizzle-orm';
import type { Event, CreateEventInput, UpdateEventInput } from '$lib/types/events';
import {
	parsePagination,
	calculatePagination,
	createPaginatedResponse,
	type PaginatedResponse,
} from '$lib/utils/pagination';
import { invalidateCacheTags, CACHE_TAGS } from '$lib/server/cache';
import { canBeSpotlight } from '$lib/utils/event-access';
import { listedEventsCondition, toAccessEvent } from './event-access';

/**
 * Events, newest first, paged. `listedOnly` (the default) keeps the Events
 * Event access lets be listed publicly (issue 030); the admin passes false.
 */
export async function getAllEvents(options: { listedOnly?: boolean; excludeSpotlight?: boolean; page?: number; limit?: number; cursor?: string; search?: string }) {
	const { listedOnly = true, excludeSpotlight = false, page = 1, limit = 20, search } = options;

	// Build where clause
	let whereClause = undefined;
	if (listedOnly) {
		whereClause = listedEventsCondition();
	}

	if (excludeSpotlight) {
		const spotlightClause = eq(events.isSpotlight, false);
		whereClause = whereClause ? and(whereClause, spotlightClause) : spotlightClause;
	}

	// Add search filter
	if (search && search.trim()) {
		const searchTerm = `%${search.trim()}%`;
		const searchCondition = or(
			ilike(events.titleEn, searchTerm),
			ilike(events.titleFr, searchTerm),
			ilike(events.descriptionEn, searchTerm),
			ilike(events.descriptionFr, searchTerm)
		);
		whereClause = whereClause ? and(whereClause, searchCondition) : searchCondition;
	}

	// Count total events for pagination
	const totalQuery = db.select({ count: sql<number>`count(*)::int` }).from(events).where(whereClause);
	const totalResult = await totalQuery;
	const total = totalResult[0]?.count ?? 0;

	// Fetch paginated events
	const paginatedEvents = await db.query.events.findMany({
		where: whereClause,
		orderBy: [desc(events.startDate)],
		limit,
		offset: (page - 1) * limit,
		with: {
			coverMedia: true,
			coverVideo: true,
			media: true,
		},
	});

	// Calculate pagination metadata
	const pagination = calculatePagination(page, limit, total);

	// Create response
	return createPaginatedResponse(paginatedEvents, pagination);
}

/** Event ids are random UUIDs and public URLs carry them (ADR 0007). */
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getEventById(id: string) {
  // Anything that is not a UUID cannot be an Event: not found, rather than
  // a database error on the cast.
  if (!EVENT_ID.test(id)) {
    throw new Error('Event not found');
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: {
      coverMedia: true,
      coverVideo: true,
      media: {
        orderBy: [desc(media.createdAt)],
      },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  return event;
}

/** The Spotlight, or null when there is none or Event access does not let
 * it be the Spotlight (issue 030). */
export async function getSpotlightEvent() {
  const spotlightEvent = await db.query.events.findFirst({
    where: eq(events.isSpotlight, true),
    with: {
      coverMedia: true,
      coverVideo: true,
      media: {
        orderBy: [desc(media.createdAt)],
      },
      eventSessions: {
        where: eq(eventSessions.published, true),
        orderBy: [eventSessions.startTime],
      },
    },
  });

  // Returns null if no spotlight event exists (valid state)
  if (!spotlightEvent || !canBeSpotlight(toAccessEvent(spotlightEvent))) return null;
  return spotlightEvent;
}

export async function createEvent(input: CreateEventInput) {
  return await db.transaction(async (tx: typeof db) => {
    // If new event is spotlight, unset any existing spotlight first
    if (input.isSpotlight) {
      await tx.update(events)
        .set({ isSpotlight: false, updatedAt: new Date() })
        .where(eq(events.isSpotlight, true));
    }

    const [event] = await tx.insert(events).values({
      titleEn: input.titleEn,
      titleFr: input.titleFr,
      descriptionEn: input.descriptionEn,
      descriptionFr: input.descriptionFr,
      subtitleEn: input.subtitleEn,
      subtitleFr: input.subtitleFr,
      startDate: input.startDate,
      endDate: input.endDate,
      locationEn: input.locationEn,
      locationFr: input.locationFr,
      venueNameEn: input.venueNameEn,
      venueNameFr: input.venueNameFr,
      streetAddressEn: input.streetAddressEn,
      streetAddressFr: input.streetAddressFr,
      districtEn: input.districtEn,
      districtFr: input.districtFr,
      cityEn: input.cityEn,
      cityFr: input.cityFr,
      postalCode: input.postalCode,
      countryEn: input.countryEn,
      countryFr: input.countryFr,
      collaborators: input.collaborators,
      timings: input.timings,
      curatorEn: input.curatorEn,
      curatorFr: input.curatorFr,
      admissionInfoEn: input.admissionInfoEn,
      admissionInfoFr: input.admissionInfoFr,
      venueCapacity: input.venueCapacity ?? null,
      coverMediaId: input.coverMediaId,
      published: input.published ?? false,
      isSpotlight: input.isSpotlight ?? false,
    }).returning();

    invalidateCacheTags([CACHE_TAGS.EVENTS]);
    return event;
  });
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  return await db.transaction(async (tx: typeof db) => {
    // If event is being set to spotlight, unset others
    if (input.isSpotlight === true) {
      await tx.update(events)
        .set({ isSpotlight: false, updatedAt: new Date() })
        .where(and(
          eq(events.isSpotlight, true),
          sql`id != ${id}`
        ));
    }

    // Once an Event has Days, startDate/endDate are derived from them
    // (ADR 0005) and recomputed whenever its Seatings change — a hand-edited
    // value is ignored so it can never diverge from the schedule. An Event
    // with no Days yet keeps its hand-entered window.
    const [day] = await tx.select({ id: eventDays.id })
      .from(eventDays)
      .where(eq(eventDays.eventId, id))
      .limit(1);
    const { startDate: _startDate, endDate: _endDate, ...rest } = input;
    const writable = day ? rest : input;

    const [updated] = await tx.update(events)
      .set({
        ...writable,
        updatedAt: new Date()
      })
      .where(eq(events.id, id))
      .returning();

    if (!updated) {
      throw new Error('Event not found');
    }

    invalidateCacheTags([CACHE_TAGS.EVENTS]);
    return updated;
  });
}

export async function deleteEvent(id: string) {
  await db.delete(events).where(eq(events.id, id));
}

export async function setEventCoverMedia(eventId: string, mediaId: string) {
  await db.update(media)
    .set({ isCover: false })
    .where(and(
      eq(media.eventId, eventId),
      eq(media.isCover, true)
    ));

  const [updated] = await db.update(events)
    .set({ coverMediaId: mediaId, updatedAt: new Date() })
    .where(eq(events.id, eventId))
    .returning();

  if (!updated) {
    throw new Error('Event not found');
  }

  return updated;
}

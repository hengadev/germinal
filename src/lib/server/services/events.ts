import { db } from '../db';
import { events, media, eventSessions, eventCategories } from '../db/schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import type { Event, CreateEventInput, UpdateEventInput } from '$lib/types/events';
import {
	parsePagination,
	calculatePagination,
	createPaginatedResponse,
	type PaginatedResponse,
} from '$lib/utils/pagination';
import { invalidateCacheTags, CACHE_TAGS } from '$lib/server/cache';

export async function getAllEvents(options: { publishedOnly?: boolean; page?: number; limit?: number; cursor?: string }) {
	const { publishedOnly = true, page = 1, limit = 20 } = options;

	// Count total events for pagination
	const totalQuery = db.select({ count: sql<number>`count(*)::int` }).from(events);
	const totalResult = await totalQuery;
	const total = totalResult[0]?.count ?? 0;

	// Fetch paginated events
	const paginatedEvents = await db.query.events.findMany({
		where: publishedOnly ? eq(events.published, true) : undefined,
		orderBy: [desc(events.startDate)],
		limit,
		offset: (page - 1) * limit,
		with: {
			coverMedia: true,
			category: true,
			media: true,
		},
	});

	// Calculate pagination metadata
	const pagination = calculatePagination(page, limit, total);

	// Create response
	return createPaginatedResponse(paginatedEvents, pagination);
}

export async function getEventBySlug(slug: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      coverMedia: true,
      category: true,
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

export async function getEventById(id: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: {
      coverMedia: true,
      category: true,
      media: true,
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  return event;
}

export async function getSpotlightEvent() {
  const spotlightEvent = await db.query.events.findFirst({
    where: eq(events.isSpotlight, true),
    with: {
      coverMedia: true,
      category: true,
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
  return spotlightEvent ?? null;
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
      slug: input.slug,
      descriptionEn: input.descriptionEn,
      descriptionFr: input.descriptionFr,
      subtitleEn: input.subtitleEn,
      subtitleFr: input.subtitleFr,
      startDate: input.startDate,
      endDate: input.endDate,
      location: input.location,
      venueName: input.venueName,
      streetAddress: input.streetAddress,
      district: input.district,
      city: input.city,
      postalCode: input.postalCode,
      country: input.country,
      collaborators: input.collaborators,
      timings: input.timings,
      curatorEn: input.curatorEn,
      curatorFr: input.curatorFr,
      materialsEn: input.materialsEn,
      materialsFr: input.materialsFr,
      admissionInfoEn: input.admissionInfoEn,
      admissionInfoFr: input.admissionInfoFr,
      coverMediaId: input.coverMediaId,
      categoryId: input.categoryId,
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

    const [updated] = await tx.update(events)
      .set({
        ...input,
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

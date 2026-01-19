import { db } from '../db';
import { events, media } from '../db/schema';
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
      media: true,
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  return event;
}

export async function createEvent(input: CreateEventInput) {
  const [event] = await db.insert(events).values({
    title: input.title,
    slug: input.slug,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    location: input.location,
    coverMediaId: input.coverMediaId,
    published: input.published ?? false,
  }).returning();

  // Invalidate events cache
  invalidateCacheTags([CACHE_TAGS.EVENTS]);

  return event;
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  const [updated] = await db.update(events)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(events.id, id))
    .returning();

  if (!updated) {
    throw new Error('Event not found');
  }

  // Invalidate events cache
  invalidateCacheTags([CACHE_TAGS.EVENTS]);

  return updated;
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

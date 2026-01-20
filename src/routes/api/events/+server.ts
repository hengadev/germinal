import { json } from '@sveltejs/kit';
import { getAllEvents, createEvent } from '$lib/server/services/events';
import { createEventSchema } from '$lib/server/validators/events';
import { requireAdmin } from '$lib/server/guards';
import { parsePagination, calculatePagination, createPaginatedResponse } from '$lib/utils/pagination';
import { getCached, CACHE_TAGS } from '$lib/server/cache';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
  const publishedOnly = url.searchParams.get('published') !== 'false';
  const pagination = parsePagination(url.searchParams);

  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const { page, limit } = pagination;
    const totalEvents = MOCK_EVENTS.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedEvents = MOCK_EVENTS.slice(startIndex, endIndex);

    const paginationMetadata = calculatePagination(page, limit, totalEvents);
    return json(createPaginatedResponse(paginatedEvents, paginationMetadata));
  }

  const result = await getCached(
    `events:${publishedOnly}:page:${pagination.page}:limit:${pagination.limit}`,
    () => getAllEvents({ publishedOnly, ...pagination }),
    {
      ttl: 60000, // 1 minute cache
      tags: [CACHE_TAGS.EVENTS]
    }
  );

  // Set cache headers
  setHeaders({
    'Cache-Control': 'public, max-age=60',
    'X-Cache': 'HIT'
  });

  return json(result);
};

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);

  const data = await event.request.json();
  const parsed = createEventSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const createdEvent = await createEvent(parsed.data);
  return json(createdEvent, { status: 201 });
};

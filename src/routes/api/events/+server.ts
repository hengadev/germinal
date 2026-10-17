import { json } from '@sveltejs/kit';
import { getAllEvents, createEvent, SpotlightRequiresPublicError } from '$lib/server/services/events';
import { createEventSchema } from '$lib/server/validators/events';
import { EventWithoutSeatingError } from '$lib/server/services/event-schedule';
import { requireAdmin } from '$lib/server/auth-guards';
import { parsePagination, calculatePagination, createPaginatedResponse } from '$lib/utils/pagination';
import { getCached, CACHE_TAGS } from '$lib/server/cache';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { isListed, viewerOf } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, setHeaders, locals }) => {
  // Unlisted Events (Drafts, Private Events) only ever go to an Admin asking for them;
  // everyone else gets what Event access lets be listed (issue 030).
  const listedOnly = url.searchParams.get('published') !== 'false' || viewerOf(locals.user).role !== 'admin';
  const excludeSpotlight = url.searchParams.get('excludeSpotlight') === 'true';
  const search = url.searchParams.get('q') || undefined;
  const pagination = parsePagination(url.searchParams);

  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    let mockEvents = MOCK_EVENTS.filter(e => !listedOnly || isListed(e));
    if (excludeSpotlight) mockEvents = mockEvents.filter(e => !e.isSpotlight);

    if (search && search.trim()) {
      const query = search.trim().toLowerCase();
      mockEvents = mockEvents.filter(e =>
        (e.titleEn ?? '').toLowerCase().includes(query) ||
        (e.titleFr ?? '').toLowerCase().includes(query) ||
        (e.descriptionEn ?? '').toLowerCase().includes(query) ||
        (e.descriptionFr ?? '').toLowerCase().includes(query)
      );
    }

    const totalEvents = mockEvents.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedEvents = mockEvents.slice(startIndex, endIndex);

    const paginationMetadata = calculatePagination(page, limit, totalEvents);
    // A public listing never carries Practical Info (issue 040).
    const listedEvents = listedOnly ? paginatedEvents.map(withoutPracticalInfo) : paginatedEvents;
    return json(createPaginatedResponse(listedEvents, paginationMetadata));
  }

  // Search results aren't cached — keyword queries are too varied to be worth caching,
  // and skipping the cache keeps `q` from bloating the events cache key space.
  if (search) {
    const result = await getAllEvents({ listedOnly, excludeSpotlight, search, ...pagination });
    return json(result);
  }

  const result = await getCached(
    `events:${listedOnly}:${excludeSpotlight}:page:${pagination.page}:limit:${pagination.limit}`,
    () => getAllEvents({ listedOnly, excludeSpotlight, ...pagination }),
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
  requireAdmin(event.locals);

  const data = await event.request.json();
  const parsed = createEventSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // A new Event has no Seating yet, and a published Event needs one
  // (ADR 0001): create it as a Draft, publish once Seatings are added.
  if (parsed.data.visibility !== 'draft') {
    return json({ error: new EventWithoutSeatingError().message }, { status: 400 });
  }

  try {
    const createdEvent = await createEvent(parsed.data);
    return json(createdEvent, { status: 201 });
  } catch (createError) {
    if (createError instanceof SpotlightRequiresPublicError) {
      return json({ error: createError.message }, { status: 400 });
    }
    throw createError;
  }
};

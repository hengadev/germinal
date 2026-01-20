import { json } from '@sveltejs/kit';
import { getAllTalents, createTalent } from '$lib/server/services/talents';
import { createTalentSchema } from '$lib/server/validators/talents';
import { requireAdmin } from '$lib/server/guards';
import { parsePagination, calculatePagination, createPaginatedResponse } from '$lib/utils/pagination';
import { getCached, CACHE_TAGS } from '$lib/server/cache';
import { MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, setHeaders }) => {
  const publishedOnly = url.searchParams.get('published') !== 'false';
  const pagination = parsePagination(url.searchParams);

  // Use mock data if enabled (no database required!)
  if (USE_MOCK_DATA) {
    const { page = 1, limit = 20 } = pagination;
    const totalTalents = MOCK_TALENTS.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTalents = MOCK_TALENTS.slice(startIndex, endIndex);

    const paginationMetadata = calculatePagination(page, limit, totalTalents);
    return json(createPaginatedResponse(paginatedTalents, paginationMetadata));
  }

  const result = await getCached(
    `talents:${publishedOnly}:page:${pagination.page}:limit:${pagination.limit}`,
    () => getAllTalents({ publishedOnly, ...pagination }),
    {
      ttl: 120000, // 2 minutes cache
      tags: [CACHE_TAGS.TALENTS]
    }
  );

  // Set cache headers
  setHeaders({
    'Cache-Control': 'public, max-age=120',
    'X-Cache': 'HIT'
  });

  return json(result);
};

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);

  const data = await event.request.json();
  const parsed = createTalentSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const talent = await createTalent(parsed.data);
  return json(talent, { status: 201 });
};

import { db } from '../db';
import { talents, media } from '../db/schema';
import { eq, desc, or, sql } from 'drizzle-orm';
import type { Talent, CreateTalentInput, UpdateTalentInput } from '$lib/types/talents';
import {
	parsePagination,
	calculatePagination,
	createPaginatedResponse,
} from '$lib/utils/pagination';
import { invalidateCacheTags, CACHE_TAGS } from '$lib/server/cache';

export async function getAllTalents(options: { publishedOnly?: boolean; page?: number; limit?: number; cursor?: string }) {
	const { publishedOnly = true, page = 1, limit = 20 } = options;

	// Count total talents for pagination
	const totalQuery = db.select({ count: sql<number>`count(*)::int` }).from(talents);
	const totalResult = await totalQuery;
	const total = totalResult[0]?.count ?? 0;

	// Fetch paginated talents
	const paginatedTalents = await db.query.talents.findMany({
		where: publishedOnly ? eq(talents.published, true) : undefined,
		orderBy: [desc(talents.createdAt)],
		limit,
		offset: (page - 1) * limit,
		with: {
			profileMedia: true,
		},
	});

	// Calculate pagination metadata
	const pagination = calculatePagination(page, limit, total);

	// Create response
	return createPaginatedResponse(paginatedTalents, pagination);
}

export async function getTalentById(id: string) {
  const talent = await db.query.talents.findFirst({
    where: eq(talents.id, id),
    with: {
      profileMedia: true,
      media: {
        orderBy: [desc(media.createdAt)],
      },
    },
  });

  if (!talent) {
    throw new Error('Talent not found');
  }

  return talent;
}

export async function createTalent(input: CreateTalentInput) {
  const [talent] = await db.insert(talents).values({
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    bio: input.bio,
    profileMediaId: input.profileMediaId,
    socialLinks: input.socialLinks,
    published: input.published ?? false,
  }).returning();

  // Invalidate talents cache
  invalidateCacheTags([CACHE_TAGS.TALENTS]);

  return talent;
}

export async function updateTalent(id: string, input: UpdateTalentInput) {
  const [updated] = await db.update(talents)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(talents.id, id))
    .returning();

  if (!updated) {
    throw new Error('Talent not found');
  }

  // Invalidate talents cache
  invalidateCacheTags([CACHE_TAGS.TALENTS]);

  return updated;
}

export async function deleteTalent(id: string) {
  await db.delete(talents).where(eq(talents.id, id));
}

export async function setTalentProfileMedia(talentId: string, mediaId: string) {
  const [updated] = await db.update(talents)
    .set({ profileMediaId: mediaId, updatedAt: new Date() })
    .where(eq(talents.id, talentId))
    .returning();

  if (!updated) {
    throw new Error('Talent not found');
  }

  return updated;
}

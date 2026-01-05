import { db } from '../db';
import { talents, media } from '../db/schema';
import { eq, desc, or } from 'drizzle-orm';
import type { Talent, CreateTalentInput, UpdateTalentInput } from '$lib/types/talents';

export async function getAllTalents(publishedOnly = true) {
  return await db.query.talents.findMany({
    where: publishedOnly ? eq(talents.published, true) : undefined,
    orderBy: [desc(talents.createdAt)],
    with: {
      profileMedia: true,
    },
  });
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

import { db } from '../db';
import { media } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { deleteFromS3 } from './s3';
import type { CreateMediaInput } from '$lib/types/media';

export async function createMedia(input: CreateMediaInput) {
  const [newMedia] = await db.insert(media).values(input).returning();
  return newMedia;
}

export async function getMediaForEvent(eventId: string) {
  return await db.query.media.findMany({
    where: eq(media.eventId, eventId),
  });
}

export async function getMediaForTalent(talentId: string) {
  return await db.query.media.findMany({
    where: eq(media.talentId, talentId),
  });
}

export async function getMediaById(id: string) {
  const mediaItem = await db.query.media.findFirst({
    where: eq(media.id, id),
  });

  if (!mediaItem) {
    throw new Error('Media not found');
  }

  return mediaItem;
}

export async function deleteMedia(id: string) {
  const [mediaItem] = await db.select().from(media).where(eq(media.id, id)).limit(1);

  if (!mediaItem) {
    throw new Error('Media not found');
  }

  await deleteFromS3(mediaItem.s3Key);
  await db.delete(media).where(eq(media.id, id));
}

export async function setCoverMedia(
  mediaId: string,
  entityType: 'event' | 'talent',
  entityId: string
) {
  const [mediaItem] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);

  if (!mediaItem) {
    throw new Error('Media not found');
  }

  await db.update(media)
    .set({ isCover: false })
    .where(
      entityType === 'event'
        ? and(eq(media.eventId, entityId), eq(media.isCover, true))
        : and(eq(media.talentId, entityId), eq(media.isCover, true))
    );

  const [updated] = await db.update(media)
    .set({ isCover: true })
    .where(eq(media.id, mediaId))
    .returning();

  return updated;
}

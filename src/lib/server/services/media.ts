import { db } from '../db';
import { media } from '../db/schema';
import { eq, and, inArray, isNull, or, sql } from 'drizzle-orm';
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

/** Sets an image's alt texts (issue 043); a language left out is kept. */
export async function updateMediaAlt(
  id: string,
  alt: { altEn?: string | null; altFr?: string | null }
) {
  const [updated] = await db.update(media).set(alt).where(eq(media.id, id)).returning();

  if (!updated) {
    throw new Error('Media not found');
  }

  return updated;
}

/**
 * Save an Event's Event Photos (issue 045), as the « Portfolio » tab holds
 * them: `photoIds` are linked to the Event and `coverId` (one of them, or
 * null) becomes the project cover — the one cover of the role. Only Event
 * Photos are touched: a Visual's id, or a media of another Event, is
 * ignored, so the two roles never mix. Returns the ids saved.
 */
export async function saveEventPhotos(eventId: string, photoIds: readonly string[], coverId: string | null) {
  return await db.transaction(async (tx: typeof db) => {
    const ids = [...new Set(photoIds)];
    const saved: string[] = ids.length === 0
      ? []
      : (await tx.update(media)
          .set({ eventId })
          .where(and(
            inArray(media.id, ids),
            eq(media.role, 'event_photo'),
            or(isNull(media.eventId), eq(media.eventId, eventId)),
          ))
          .returning({ id: media.id })).map((row: { id: string }) => row.id);

    await tx.update(media)
      .set({ isCover: false })
      .where(and(eq(media.eventId, eventId), eq(media.role, 'event_photo'), eq(media.isCover, true)));
    const cover = coverId !== null && saved.includes(coverId) ? coverId : null;
    if (cover) {
      await tx.update(media).set({ isCover: true }).where(eq(media.id, cover));
    }
    return saved;
  });
}

/**
 * Save an Event's Visuals (« Visuels »): `coverId` first, then the gallery,
 * linked to the Event, the cover marked as the Visuals' one cover. Event
 * Photos are never touched (issue 045). Returns the ids saved.
 */
export async function saveEventVisuals(eventId: string, coverId: string | null, galleryIds: readonly string[]) {
  return await db.transaction(async (tx: typeof db) => {
    const ids = coverId ? [coverId, ...galleryIds.filter((id) => id !== coverId)] : [...galleryIds];
    const notEventPhoto = sql`${media.role} IS DISTINCT FROM 'event_photo'`;

    await tx.update(media)
      .set({ isCover: false })
      .where(and(eq(media.eventId, eventId), notEventPhoto, eq(media.isCover, true)));

    const saved: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const rows: { id: string }[] = await tx.update(media)
        .set({ eventId, role: 'visual', isCover: i === 0 })
        .where(and(eq(media.id, ids[i]), notEventPhoto, isNull(media.talentId)))
        .returning({ id: media.id });
      saved.push(...rows.map((row) => row.id));
    }
    return saved;
  });
}

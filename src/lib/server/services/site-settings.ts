import { db } from '../db';
import { siteSettings, media } from '../db/schema';
import { eq } from 'drizzle-orm';
import { uploadStreamToS3, deleteFromS3 } from './s3';
import { createMedia, deleteMedia } from './media';
import { randomUUID } from 'node:crypto';
import { env } from '../env';
import { logger } from '$lib/server/logger';

function getExtension(mimeType: string): string {
    const map: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov',
    };
    return map[mimeType] || '';
}

export async function getSiteSettings() {
    const row = await db.query.siteSettings.findFirst({
        with: {
            heroImage: true,
            heroVideo: true,
        },
    });
    return row ?? null;
}

async function uploadSiteMedia(file: File, siteRole: 'hero_image' | 'hero_video') {
    const key = `site/${randomUUID()}${getExtension(file.type)}`;
    const uploadResult = await uploadStreamToS3(key, file.stream(), file.type, file.size);
    const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
    return createMedia({
        type: mediaType,
        url: uploadResult.url,
        s3Key: uploadResult.key,
        mimeType: file.type,
        size: file.size,
        eventId: null,
        talentId: null,
        isCover: false,
        siteRole,
    });
}

async function getOrCreateSettings() {
    const existing = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
    if (existing.length > 0) return existing[0];
    const [row] = await db.insert(siteSettings).values({ id: 1 }).returning();
    return row;
}

export async function updateHeroImage(file: File) {
    const current = await getOrCreateSettings();

    const newMedia = await uploadSiteMedia(file, 'hero_image');

    await db.update(siteSettings)
        .set({ heroImageId: newMedia.id, updatedAt: new Date() })
        .where(eq(siteSettings.id, 1));

    if (current.heroImageId) {
        try {
            await deleteMedia(current.heroImageId);
        } catch (err) {
            logger.warn({ err }, '[SiteSettings] Failed to delete old hero image');
        }
    }

    return newMedia;
}

export async function updateHeroVideo(file: File) {
    const current = await getOrCreateSettings();

    const newMedia = await uploadSiteMedia(file, 'hero_video');

    await db.update(siteSettings)
        .set({ heroVideoId: newMedia.id, updatedAt: new Date() })
        .where(eq(siteSettings.id, 1));

    if (current.heroVideoId) {
        try {
            await deleteMedia(current.heroVideoId);
        } catch (err) {
            logger.warn({ err }, '[SiteSettings] Failed to delete old hero video');
        }
    }

    return newMedia;
}

export async function clearHeroImage() {
    const current = await getOrCreateSettings();

    await db.update(siteSettings)
        .set({ heroImageId: null, updatedAt: new Date() })
        .where(eq(siteSettings.id, 1));

    if (current.heroImageId) {
        try {
            await deleteMedia(current.heroImageId);
        } catch (err) {
            logger.warn({ err }, '[SiteSettings] Failed to delete hero image on clear');
        }
    }
}

export async function clearHeroVideo() {
    const current = await getOrCreateSettings();

    await db.update(siteSettings)
        .set({ heroVideoId: null, updatedAt: new Date() })
        .where(eq(siteSettings.id, 1));

    if (current.heroVideoId) {
        try {
            await deleteMedia(current.heroVideoId);
        } catch (err) {
            logger.warn({ err }, '[SiteSettings] Failed to delete hero video on clear');
        }
    }
}

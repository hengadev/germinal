import { db } from '../db';
import { media } from '../db/schema';
import { deleteFromS3 } from '../services/s3';
import { isNull, and, lt, eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

const ORPHAN_THRESHOLD_HOURS = 24;

export interface CleanupOrphanedMediaResult {
	deleted: number;
	failed: number;
	errors: Array<{ id: string; error: string }>;
}

/**
 * Cleanup orphaned media files
 * Finds media with no entity link (eventId and talentId are both null)
 * that are older than the threshold and deletes them from S3 and the database
 */
export async function cleanupOrphanedMedia(): Promise<CleanupOrphanedMediaResult> {
	const threshold = new Date();
	threshold.setHours(threshold.getHours() - ORPHAN_THRESHOLD_HOURS);

	try {
		// Find media with no entity link older than threshold
		const orphaned = await db
			.select({
				id: media.id,
				s3Key: media.s3Key,
				createdAt: media.createdAt
			})
			.from(media)
			.where(
				and(
					isNull(media.eventId),
					isNull(media.talentId),
					lt(media.createdAt, threshold)
				)
			);

		if (orphaned.length === 0) {
			logger.info('[Cleanup Orphaned Media] No orphaned media found');
			return { deleted: 0, failed: 0, errors: [] };
		}

		logger.info(`[Cleanup Orphaned Media] Found ${orphaned.length} orphaned media files`);

		const result: CleanupOrphanedMediaResult = {
			deleted: 0,
			failed: 0,
			errors: []
		};

		for (const item of orphaned) {
			try {
				// Delete from S3 (only if S3 is configured)
				try {
					await deleteFromS3(item.s3Key);
				} catch (s3Error) {
					// Log S3 error but continue to delete from database
					logger.warn({ err: s3Error, s3Key: item.s3Key }, '[Cleanup Orphaned Media] Failed to delete from S3');
				}

				// Delete from database
				await db.delete(media).where(eq(media.id, item.id));

				result.deleted++;
				logger.info(`[Cleanup Orphaned Media] Deleted orphaned media: ${item.id}`);
			} catch (error) {
				result.failed++;
				result.errors.push({
					id: item.id,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				logger.error({ err: error, mediaId: item.id }, '[Cleanup Orphaned Media] Failed to delete orphaned media');
			}
		}

		logger.info(
			`[Cleanup Orphaned Media] Cleanup complete: ${result.deleted} deleted, ${result.failed} failed`
		);

		return result;
	} catch (error) {
		logger.error({ err: error }, '[Cleanup Orphaned Media] Failed to cleanup orphaned media');
		throw error;
	}
}

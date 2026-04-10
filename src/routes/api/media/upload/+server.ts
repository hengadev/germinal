import { json, error } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { uploadStreamToS3, deleteFromS3 } from '$lib/server/services/s3';
import { createMedia } from '$lib/server/services/media';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '$lib/server/guards';
import { env } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);

  logger.info('Upload request received');

  const formData = await event.request.formData();

  // Support both 'files' (legacy) and 'file' (single file upload)
  const files = formData.getAll('files') as File[];
  const file = formData.get('file') as File | null;
  const filesToUpload = file && !files.length ? [file] : files;

  logger.info({ fileCount: filesToUpload.length }, 'Files to upload');

  if (!filesToUpload.length) {
    return error(400, 'No files provided');
  }

  const entityType = formData.get('entityType') as 'event' | 'talent' | null;
  const entityId = formData.get('entityId') as string | null;

  logger.info({ entityType, entityId }, 'Upload entity info');

  if (!entityType) {
    return error(400, 'Entity type required');
  }

  const uploadedMedia = [];

  // Upload files using streaming (no memory issues with large files)
  for (const file of filesToUpload) {
    logger.info({ name: file.name, size: file.size, type: file.type }, 'Processing file');

    if (file.size === 0 || typeof file.size !== 'number') {
      logger.warn({ name: file.name }, 'Skipping empty/invalid file');
      continue; // Skip empty or invalid files
    }

    if (file.size > env.MAX_FILE_SIZE) {
      logger.warn({ size: file.size, max: env.MAX_FILE_SIZE }, 'File too large');
      return error(400, `File ${file.name} exceeds max size of ${env.MAX_FILE_SIZE} bytes`);
    }

    // Validate file type
    const allowedTypes = entityType === 'event'
      ? [...env.ALLOWED_IMAGE_TYPES, ...env.ALLOWED_VIDEO_TYPES]
      : [...env.ALLOWED_IMAGE_TYPES];

    if (!allowedTypes.includes(file.type)) {
      logger.warn({ type: file.type, allowed: allowedTypes }, 'File type not allowed');
      return error(400, `File type ${file.type} not allowed`);
    }

    try {
      const folder = entityType === 'event' ? 'events' : 'talents';
      const key = `${folder}/${randomUUID()}${getExtensionFromMimeType(file.type)}`;
      const fileSize = file.size;

      logger.info({ key, bucket: env.S3_BUCKET_NAME, region: env.AWS_REGION }, 'Starting S3 upload');

      const uploadResult = await uploadStreamToS3(
        key,
        file.stream(),
        file.type,
        fileSize
      );

      logger.info({ url: uploadResult.url }, 'S3 upload complete');

      const mediaType = file.type.startsWith('image/') ? 'image' : 'video';

      // If entityId is provided, link immediately. Otherwise leave unlinked (will be linked when form is submitted)
      const mediaRecord = await createMedia({
        type: mediaType,
        url: uploadResult.url,
        s3Key: uploadResult.key,
        mimeType: file.type,
        size: fileSize,
        eventId: entityType === 'event' ? (entityId ?? null) : null,
        talentId: entityType === 'talent' ? (entityId ?? null) : null,
        isCover: false,
      });

      logger.info({ mediaId: mediaRecord.id }, 'Media record created');

      uploadedMedia.push({
        id: mediaRecord.id,
        url: mediaRecord.url,
        s3Key: mediaRecord.s3Key,
        mimeType: mediaRecord.mimeType,
        size: mediaRecord.size,
        type: mediaType,
      });

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.error({ err, name: file.name, bucket: env.S3_BUCKET_NAME, region: env.AWS_REGION }, 'File upload error');
      return error(500, `Failed to upload file ${file.name}: ${reason}`);
    }
  }

  return json({
    success: true,
    media: uploadedMedia,
  }, { status: 201 });
};

function getExtensionFromMimeType(mimeType: string): string {
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


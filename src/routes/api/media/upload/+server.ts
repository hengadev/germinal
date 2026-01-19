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

  const formData = await event.request.formData();
  const files = formData.getAll('files') as File[];

  if (!files.length) {
    return error(400, 'No files provided');
  }

  const entityType = formData.get('entityType') as 'event' | 'talent';
  const entityId = formData.get('entityId') as string;

  if (!entityType || !entityId) {
    return error(400, 'Entity type and ID required');
  }

  const uploadedMedia = [];

  // Upload files using streaming (no memory issues with large files)
  for (const file of files) {
    if (file.size > env.MAX_FILE_SIZE) {
      return error(400, `File ${file.name} exceeds max size of ${env.MAX_FILE_SIZE} bytes`);
    }

    // Validate file type
    const allowedTypes = entityType === 'event'
      ? [...env.ALLOWED_IMAGE_TYPES, ...env.ALLOWED_VIDEO_TYPES]
      : [...env.ALLOWED_IMAGE_TYPES];

    if (!allowedTypes.includes(file.type)) {
      return error(400, `File type ${file.type} not allowed`);
    }

    try {
      // Use streaming upload to avoid loading entire file into memory
      const folder = entityType === 'event' ? 'events' : 'talents';
      const key = `${folder}/${randomUUID()}${getExtensionFromMimeType(file.type)}`;
      const fileSize = file.size;
      
      const uploadResult = await uploadStreamToS3(
        key,
        file.stream(),
        file.type,
        fileSize
      );

      const mediaType = file.type.startsWith('image/') ? 'image' : 'video';

      const mediaRecord = await createMedia({
        type: mediaType,
        url: uploadResult.url,
        s3Key: uploadResult.key,
        mimeType: file.type,
        size: fileSize,
        eventId: entityType === 'event' ? entityId : null,
        talentId: entityType === 'talent' ? entityId : null,
        isCover: false,
      });

      uploadedMedia.push({
        id: mediaRecord.id,
        url: mediaRecord.url,
        type: mediaType,
      });

    } catch (err) {
      logger.error('File upload error:', err);
      return error(500, `Failed to upload file ${file.name}`);
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


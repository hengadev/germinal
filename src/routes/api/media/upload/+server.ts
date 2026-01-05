import { json, error } from '@sveltejs/kit';
import { uploadToS3 } from '$lib/server/services/s3';
import { createMedia } from '$lib/server/services/media';
import { env } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];
  const entityType = formData.get('entityType') as 'event' | 'talent';
  const entityId = formData.get('entityId') as string;

  if (!files.length) {
    throw error(400, 'No files provided');
  }

  if (!entityType || !entityId) {
    throw error(400, 'Entity type and ID required');
  }

  const uploadedMedia = [];

  for (const file of files) {
    if (file.size > env.MAX_FILE_SIZE) {
      throw error(400, `File ${file.name} exceeds max size`);
    }

    const allowedTypes = [...env.ALLOWED_IMAGE_TYPES, ...env.ALLOWED_VIDEO_TYPES];
    if (!allowedTypes.includes(file.type)) {
      throw error(400, `File type ${file.type} not allowed`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadToS3(buffer, file.type, entityType === 'event' ? 'events' : 'talents');

    const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
    const mediaRecord = await createMedia({
      type: mediaType,
      url: uploadResult.url,
      s3Key: uploadResult.key,
      mimeType: file.type,
      size: file.size,
      eventId: entityType === 'event' ? entityId : null,
      talentId: entityType === 'talent' ? entityId : null,
      isCover: false,
    });

    uploadedMedia.push(mediaRecord);
  }

  return json(uploadedMedia, { status: 201 });
};

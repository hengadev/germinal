import { json, error } from '@sveltejs/kit';
import { getMediaById, deleteMedia } from '$lib/server/services/media';
import { requireAdmin } from '$lib/server/guards';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const media = await getMediaById(params.id);
    return json(media);
  } catch {
    throw error(404, 'Media not found');
  }
};

export const DELETE: RequestHandler = async (event) => {
  requireAdmin(event);

  try {
    await deleteMedia(event.params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Media not found');
  }
};

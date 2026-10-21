import { json, error } from '@sveltejs/kit';
import { getMediaById, deleteMedia, updateMediaAlt, canViewMedia } from '$lib/server/services/media';
import { viewerOf } from '$lib/utils/event-access';
import { parseAltText } from '$lib/utils/media-alt';
import { requireAdmin } from '$lib/server/auth-guards';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  let media;
  try {
    media = await getMediaById(params.id);
  } catch {
    throw error(404, 'Media not found');
  }
  // Hidden media answers 404, like media that doesn't exist.
  if (!(await canViewMedia(media, viewerOf(locals.user)))) {
    throw error(404, 'Media not found');
  }
  return json(media);
};

export const DELETE: RequestHandler = async (event) => {
  requireAdmin(event.locals);

  try {
    await deleteMedia(event.params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Media not found');
  }
};

/** Sets an image's alt texts (issue 043): `{ altEn?, altFr? }`, blank clears. */
export const PATCH: RequestHandler = async (event) => {
  requireAdmin(event.locals);

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    throw error(400, 'Corps de requête invalide');
  }
  if (typeof body !== 'object' || body === null) {
    throw error(400, 'Corps de requête invalide');
  }

  const parsed = parseAltText(body as { altEn?: unknown; altFr?: unknown });
  if (!parsed.ok) {
    throw error(400, parsed.error);
  }

  try {
    const media =
      Object.keys(parsed.value).length === 0
        ? await getMediaById(event.params.id)
        : await updateMediaAlt(event.params.id, parsed.value);
    return json(media);
  } catch {
    throw error(404, 'Media not found');
  }
};

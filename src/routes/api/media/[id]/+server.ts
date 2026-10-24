import { json, error } from '@sveltejs/kit';
import { getMediaById, deleteMedia, updateMediaAlt, canViewMedia } from '$lib/server/services/media';
import { viewerOf } from '$lib/utils/event-access';
import { MAX_ALT_TEXT_LENGTH, parseAltText } from '$lib/utils/media-alt';
import { followFrench } from '$lib/server/services/event-translation';
import { getTranslator } from '$lib/server/services/translator';
import { logger } from '$lib/server/logger';
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

/** Sets an image's alt texts (issue 043): `{ altEn?, altFr? }`, blank clears.
 * Answers with the media, whose English may have been generated. */
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

  let stored;
  try {
    stored = await getMediaById(event.params.id);
  } catch {
    throw error(404, 'Media not found');
  }
  if (Object.keys(parsed.value).length === 0) {
    return json(stored);
  }

  // A French alt text brings its English along (DeepL), unless the English
  // is posted too.
  const alt = { ...parsed.value };
  if ('altFr' in alt) {
    const english = await followFrench(
      [{
        fr: alt.altFr ?? null,
        en: 'altEn' in alt ? alt.altEn ?? null : stored.altEn ?? null,
        storedFr: stored.altFr ?? null,
        storedEn: stored.altEn ?? null,
        maxLength: MAX_ALT_TEXT_LENGTH,
      }],
      getTranslator()
    );
    if (english.translationFailed) {
      logger.error({ err: english.error, mediaId: event.params.id }, 'Alt text English translation failed');
    }
    alt.altEn = english.value[0];
  }

  try {
    return json(await updateMediaAlt(event.params.id, alt));
  } catch {
    throw error(404, 'Media not found');
  }
};

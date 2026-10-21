import { json, error } from '@sveltejs/kit';
import { getTalentById, updateTalent, deleteTalent } from '$lib/server/services/talents';
import { updateTalentSchema } from '$lib/server/validators/talents';
import { requireAdmin } from '$lib/server/auth-guards';
import { viewerOf } from '$lib/utils/event-access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  let talent;
  try {
    talent = await getTalentById(params.id);
  } catch {
    throw error(404, 'Talent not found');
  }
  // Only the Admin reads an unpublished Talent; anyone else gets 404.
  if (!talent.published && viewerOf(locals.user).role !== 'admin') {
    throw error(404, 'Talent not found');
  }
  return json(talent);
};

export const PUT: RequestHandler = async (event) => {
  requireAdmin(event.locals);

  const data = await event.request.json();
  const parsed = updateTalentSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const talent = await updateTalent(event.params.id, parsed.data);
    return json(talent);
  } catch {
    throw error(404, 'Talent not found');
  }
};

export const DELETE: RequestHandler = async (event) => {
  requireAdmin(event.locals);

  try {
    await deleteTalent(event.params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Talent not found');
  }
};

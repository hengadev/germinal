import { json, error } from '@sveltejs/kit';
import { getTalentById, updateTalent, deleteTalent } from '$lib/server/services/talents';
import { updateTalentSchema } from '$lib/server/validators/talents';
import { requireAdmin } from '$lib/server/guards';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const talent = await getTalentById(params.id);
    return json(talent);
  } catch {
    throw error(404, 'Talent not found');
  }
};

export const PUT: RequestHandler = async (event) => {
  requireAdmin(event);

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
  requireAdmin(event);

  try {
    await deleteTalent(event.params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Talent not found');
  }
};

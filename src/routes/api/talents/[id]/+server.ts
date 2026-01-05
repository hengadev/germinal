import { json, error } from '@sveltejs/kit';
import { getTalentById, updateTalent, deleteTalent } from '$lib/server/services/talents';
import { updateTalentSchema } from '$lib/server/validators/talents';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const talent = await getTalentById(params.id);
    return json(talent);
  } catch {
    throw error(404, 'Talent not found');
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const data = await request.json();
  const parsed = updateTalentSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const talent = await updateTalent(params.id, parsed.data);
    return json(talent);
  } catch {
    throw error(404, 'Talent not found');
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteTalent(params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Talent not found');
  }
};

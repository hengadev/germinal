import { json } from '@sveltejs/kit';
import { getAllTalents, createTalent } from '$lib/server/services/talents';
import { createTalentSchema } from '$lib/server/validators/talents';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const publishedOnly = url.searchParams.get('published') !== 'false';
  const talents = await getAllTalents(publishedOnly);
  return json(talents);
};

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  const parsed = createTalentSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const talent = await createTalent(parsed.data);
  return json(talent, { status: 201 });
};

import { json } from '@sveltejs/kit';
import { getAllEvents, createEvent } from '$lib/server/services/events';
import { createEventSchema } from '$lib/server/validators/events';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const publishedOnly = url.searchParams.get('published') !== 'false';
  const events = await getAllEvents(publishedOnly);
  return json(events);
};

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  const parsed = createEventSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const event = await createEvent(parsed.data);
  return json(event, { status: 201 });
};

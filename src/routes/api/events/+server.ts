import { json } from '@sveltejs/kit';
import { getAllEvents, createEvent } from '$lib/server/services/events';
import { createEventSchema } from '$lib/server/validators/events';
import { requireAdmin } from '$lib/server/guards';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const publishedOnly = url.searchParams.get('published') !== 'false';
  const events = await getAllEvents(publishedOnly);
  return json(events);
};

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);

  const data = await event.request.json();
  const parsed = createEventSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const createdEvent = await createEvent(parsed.data);
  return json(createdEvent, { status: 201 });
};

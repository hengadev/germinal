import { json, error } from '@sveltejs/kit';
import { getEventById, updateEvent, deleteEvent } from '$lib/server/services/events';
import { updateEventSchema } from '$lib/server/validators/events';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const event = await getEventById(params.id);
    return json(event);
  } catch {
    throw error(404, 'Event not found');
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const data = await request.json();
  const parsed = updateEventSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const event = await updateEvent(params.id, parsed.data);
    return json(event);
  } catch {
    throw error(404, 'Event not found');
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteEvent(params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Event not found');
  }
};

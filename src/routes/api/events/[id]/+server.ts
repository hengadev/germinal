import { json, error } from '@sveltejs/kit';
import { getEventById, updateEvent, deleteEvent } from '$lib/server/services/events';
import { updateEventSchema } from '$lib/server/validators/events';
import { requireAdmin } from '$lib/server/guards';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const event = await getEventById(params.id);
    return json(event);
  } catch {
    throw error(404, 'Event not found');
  }
};

export const PUT: RequestHandler = async (event) => {
  requireAdmin(event);

  const data = await event.request.json();
  const parsed = updateEventSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updatedEvent = await updateEvent(event.params.id, parsed.data);
    return json(updatedEvent);
  } catch {
    throw error(404, 'Event not found');
  }
};

export const DELETE: RequestHandler = async (event) => {
  requireAdmin(event);

  try {
    await deleteEvent(event.params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Event not found');
  }
};

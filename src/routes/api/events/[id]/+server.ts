import { json, error } from '@sveltejs/kit';
import { getEventById, updateEvent, deleteEvent, SpotlightRequiresPublicError } from '$lib/server/services/events';
import { updateEventSchema } from '$lib/server/validators/events';
import { assertEventHasSeatings, EventWithoutSeatingError } from '$lib/server/services/event-schedule';
import { requireAdmin } from '$lib/server/auth-guards';
import { toAccessEvent } from '$lib/server/services/event-access';
import { eventAccess, viewerOf } from '$lib/utils/event-access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  let event;
  try {
    event = await getEventById(params.id);
  } catch {
    throw error(404, 'Event not found');
  }
  // The Admin reads any Event's data; anyone else only an Event Event
  // access lets them see (issue 030).
  const viewer = viewerOf(locals.user);
  if (viewer.role !== 'admin' && !eventAccess(toAccessEvent(event), viewer).visible) {
    throw error(404, 'Event not found');
  }
  return json(event);
};

export const PUT: RequestHandler = async (event) => {
  requireAdmin(event.locals);

  const data = await event.request.json();
  const parsed = updateEventSchema.safeParse(data);

  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // A published Event must have at least one Seating (ADR 0001).
  if (parsed.data.visibility !== undefined && parsed.data.visibility !== 'draft') {
    try {
      await assertEventHasSeatings(event.params.id);
    } catch (seatingError) {
      if (seatingError instanceof EventWithoutSeatingError) {
        return json({ error: seatingError.message }, { status: 400 });
      }
      throw seatingError;
    }
  }

  try {
    const updatedEvent = await updateEvent(event.params.id, parsed.data);
    return json(updatedEvent);
  } catch (updateError) {
    if (updateError instanceof SpotlightRequiresPublicError) {
      return json({ error: updateError.message }, { status: 400 });
    }
    throw error(404, 'Event not found');
  }
};

export const DELETE: RequestHandler = async (event) => {
  requireAdmin(event.locals);

  try {
    await deleteEvent(event.params.id);
    return json({ success: true });
  } catch {
    throw error(404, 'Event not found');
  }
};

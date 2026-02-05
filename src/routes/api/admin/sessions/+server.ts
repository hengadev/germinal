import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { requireAdmin } from '$lib/server/guards';
import { createEventSession, getAllSessionsByEventId } from '$lib/server/services/event-sessions';
import { createEventSessionSchema } from '$lib/server/validators/event-sessions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);

	const eventId = event.url.searchParams.get('eventId');

	if (!eventId) {
		return json({ error: 'eventId query parameter is required' }, { status: 400 });
	}

	try {
		const sessions = await getAllSessionsByEventId(eventId);
		return json({ sessions });
	} catch (error) {
		logger.error({ err: error }, 'Failed to fetch sessions');
		return json({ error: 'Failed to fetch sessions' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);

	const data = await event.request.json();
	const validated = createEventSessionSchema.safeParse(data);

	if (!validated.success) {
		return json({ error: validated.error.flatten() }, { status: 400 });
	}

	try {
		const session = await createEventSession(validated.data);
		return json(session, { status: 201 });
	} catch (error) {
		logger.error({ err: error }, 'Failed to create session');
		return json({ error: 'Failed to create session' }, { status: 500 });
	}
};

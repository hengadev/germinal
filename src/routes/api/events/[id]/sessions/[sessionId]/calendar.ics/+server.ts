import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateICS } from '$lib/server/utils/calendar';
import { getEventById } from '$lib/server/services/events';
import { db } from '$lib/server/db';
import { eventSessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { toAccessEvent } from '$lib/server/services/event-access';
import { eventAccess, viewerOf } from '$lib/utils/event-access';

// GET /api/events/[id]/sessions/[sessionId]/calendar.ics - Get ICS calendar file for a session
export const GET: RequestHandler = async ({ params, locals }) => {
	let event;
	try {
		event = await getEventById(params.id);
	} catch {
		throw error(404, 'Event not found');
	}

	// Event access (issue 030): an Event the viewer may not see is not found.
	if (!eventAccess(toAccessEvent(event), viewerOf(locals.user)).visible) {
		throw error(404, 'Event not found');
	}

	let session;
	try {
		[session] = await db
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, params.sessionId))
			.limit(1);
	} catch (err) {
		console.error('Failed to generate calendar file:', err);
		throw error(500, 'Failed to generate calendar file');
	}

	// The Seating must belong to the Event.
	if (!session || session.eventId !== event.id) {
		throw error(404, 'Session not found');
	}

	const icsContent = generateICS(event, session);

	return new Response(icsContent, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="event-${params.id}-${params.sessionId}.ics"`,
			'Cache-Control': 'public, max-age=3600',
		},
	});
};

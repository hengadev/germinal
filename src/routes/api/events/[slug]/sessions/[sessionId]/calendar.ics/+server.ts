import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateICS } from '$lib/server/utils/calendar';
import { getEventBySlug } from '$lib/server/services/events';
import { db } from '$lib/server/db';
import { eventSessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/events/[slug]/sessions/[sessionId]/calendar.ics - Get ICS calendar file for a session
export const GET: RequestHandler = async ({ params }) => {
	try {
		// Get event by slug
		const event = await getEventBySlug(params.slug);
		if (!event) {
			throw error(404, 'Event not found');
		}

		// Get session
		const [session] = await db
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, params.sessionId))
			.limit(1);

		if (!session) {
			throw error(404, 'Session not found');
		}

		// Verify session belongs to event
		if (session.eventId !== event.id) {
			throw error(404, 'Session not found for this event');
		}

		// Generate ICS content
		const icsContent = generateICS(event, session);

		// Return ICS file
		return new Response(icsContent, {
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Content-Disposition': `attachment; filename="event-${params.slug}-${params.sessionId}.ics"`,
				'Cache-Control': 'public, max-age=3600',
			},
		});
	} catch (err) {
		console.error('Failed to generate calendar file:', err);
		if (err instanceof Error && err.message === 'Event not found') {
			throw error(404, 'Event not found');
		}
		throw error(500, 'Failed to generate calendar file');
	}
};

import { json } from '@sveltejs/kit';
import { getEventById } from '$lib/server/services/events';
import { getPublishedSessionsByEventId } from '$lib/server/services/event-sessions';
import { toAccessEvent } from '$lib/server/services/event-access';
import { eventAccess, viewerOf } from '$lib/utils/event-access';
import type { RequestHandler } from './$types';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const event = await getEventById(params.id);
		// Event access (issue 030): an Event the viewer may not see is not found.
		if (!eventAccess(toAccessEvent(event), viewerOf(locals.user)).visible) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		const sessions = await getPublishedSessionsByEventId(event.id);

		return json({
			sessions: sessions.map((session: typeof sessions[number]) => ({
				id: session.id,
				...seatingTitlesWithFallback(session, { timeZone: event.timeZone }),
				descriptionEn: session.descriptionEn,
				descriptionFr: session.descriptionFr,
				startTime: session.startTime,
				endTime: session.endTime,
				// Price per seat from the Seating's Service (issue 022); null
				// while it is not set yet (the Seating cannot be booked).
				priceAmount: session.price?.amount ?? null,
				currency: session.price?.currency ?? session.service.currency,
				totalCapacity: session.totalCapacity,
				availableCapacity: session.availableCapacity,
				soldOut: session.availableCapacity === 0,
			})),
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'Event not found') {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		throw error;
	}
};

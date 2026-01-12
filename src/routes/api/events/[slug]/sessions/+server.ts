import { json } from '@sveltejs/kit';
import { getEventBySlug } from '$lib/server/services/events';
import { getPublishedSessionsByEventId } from '$lib/server/services/event-sessions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const event = await getEventBySlug(params.slug);
		const sessions = await getPublishedSessionsByEventId(event.id);

		return json({
			sessions: sessions.map(session => ({
				id: session.id,
				title: session.title,
				description: session.description,
				startTime: session.startTime,
				endTime: session.endTime,
				priceAmount: session.priceAmount,
				currency: session.currency,
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

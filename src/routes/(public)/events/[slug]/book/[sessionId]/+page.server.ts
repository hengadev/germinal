import { getEventBySlug } from '$lib/server/services/events';
import { getSessionById } from '$lib/server/services/event-sessions';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

function mapSession(s: (typeof MOCK_SESSIONS)[number]) {
	return {
		id: s.id,
		titleEn: (s as any).titleEn || s.title,
		titleFr: (s as any).titleFr || s.title,
		descriptionEn: (s as any).descriptionEn ?? null,
		descriptionFr: (s as any).descriptionFr ?? null,
		startTime: s.startTime.toISOString(),
		endTime: s.endTime.toISOString(),
		priceAmount: s.priceAmount,
		currency: s.currency,
		availableCapacity: s.availableCapacity,
		totalCapacity: s.totalCapacity,
		allowWaitlist: s.allowWaitlist,
		soldOut: s.availableCapacity === 0,
		isPast: s.startTime < new Date()
	};
}

export const load: PageServerLoad = async ({ params }) => {
	if (USE_MOCK_DATA) {
		const event = MOCK_EVENTS.find((e) => e.slug === params.slug);
		if (!event) throw error(404, 'Event not found');

		const session = MOCK_SESSIONS.find(
			(s) => s.id === params.sessionId && s.eventId === event.id
		);
		if (!session) throw error(404, 'Session not found');

		return { event, session: mapSession(session), isMockMode: true };
	}

	try {
		const event = await getEventBySlug(params.slug);
		const dbSession = await getSessionById(params.sessionId);

		if (dbSession.event.id !== event.id) throw error(404, 'Session not found');

		return {
			event,
			session: {
				id: dbSession.id,
				titleEn: dbSession.titleEn,
				titleFr: dbSession.titleFr,
				descriptionEn: dbSession.descriptionEn ?? null,
				descriptionFr: dbSession.descriptionFr ?? null,
				startTime: dbSession.startTime.toISOString(),
				endTime: dbSession.endTime.toISOString(),
				priceAmount: dbSession.priceAmount,
				currency: dbSession.currency,
				availableCapacity: dbSession.availableCapacity,
				totalCapacity: dbSession.totalCapacity,
				allowWaitlist: dbSession.allowWaitlist,
				soldOut: dbSession.availableCapacity === 0,
				isPast: dbSession.startTime < new Date()
			},
			isMockMode: false
		};
	} catch {
		throw error(404, 'Not found');
	}
};

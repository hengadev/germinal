import { getEventBySlug } from '$lib/server/services/events';
import { getSessionById } from '$lib/server/services/event-sessions';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';
import { depositRuleOf } from '$lib/utils/pricing';
import { refundPolicyOf } from '$lib/utils/refund-policy';

function mapSession(s: (typeof MOCK_SESSIONS)[number]) {
	return {
		id: s.id,
		...seatingTitlesWithFallback(s),
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

		return { event, session: mapSession(session), deposit: depositRuleOf(event), refundPolicy: refundPolicyOf(event), isMockMode: true };
	}

	try {
		const event = await getEventBySlug(params.slug);
		const dbSession = await getSessionById(params.sessionId);

		if (dbSession.event.id !== event.id) throw error(404, 'Session not found');
		// Booked at its Service's price (issue 022); a Seating whose Service
		// has no price yet cannot be booked.
		if (!dbSession.price) throw error(404, 'Session not found');

		return {
			event,
			session: {
				id: dbSession.id,
				...seatingTitlesWithFallback(dbSession),
				descriptionEn: dbSession.descriptionEn ?? null,
				descriptionFr: dbSession.descriptionFr ?? null,
				startTime: dbSession.startTime.toISOString(),
				endTime: dbSession.endTime.toISOString(),
				priceAmount: dbSession.price.amount,
				currency: dbSession.price.currency,
				availableCapacity: dbSession.availableCapacity,
				totalCapacity: dbSession.totalCapacity,
				allowWaitlist: dbSession.allowWaitlist,
				soldOut: dbSession.availableCapacity === 0,
				isPast: dbSession.startTime < new Date()
			},
			// The Event's Deposit rule (issue 023): the Guest sees the total,
			// Deposit and Balance before paying.
			deposit: depositRuleOf(event),
			// Its Refund Policy (issue 027), shown before paying.
			refundPolicy: refundPolicyOf(event),
			isMockMode: false
		};
	} catch {
		throw error(404, 'Not found');
	}
};

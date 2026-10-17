import { getEventById } from '$lib/server/services/events';
import { getSessionById } from '$lib/server/services/event-sessions';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { seatingTitlesWithFallback } from '$lib/utils/seating-title';
import { depositRuleOf } from '$lib/utils/pricing';
import { refundPolicyOf } from '$lib/utils/refund-policy';
import { loadSeatingAccess, toAccessEvent, toAccessSeating } from '$lib/server/services/event-access';
import { db } from '$lib/server/db';
import { eventAccess, seatingBooking, viewerOf } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';

function mapSession(s: (typeof MOCK_SESSIONS)[number], timeZone: string) {
	return {
		id: s.id,
		...seatingTitlesWithFallback(s, { timeZone }),
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

export const load: PageServerLoad = async ({ params, locals }) => {
	const viewer = viewerOf(locals.user);

	if (USE_MOCK_DATA) {
		const event = MOCK_EVENTS.find((e) => e.id === params.id);
		if (!event || !eventAccess(event, viewer).visible) throw error(404, 'Event not found');

		const session = MOCK_SESSIONS.find(
			(s) => s.id === params.sessionId && s.eventId === event.id
		);
		if (!session) throw error(404, 'Session not found');

		// The same rule as the database path: the Admin preview (033) may
		// show a Draft's page, but its Seatings cannot be booked.
		const booking = seatingBooking({
			event,
			seating: toAccessSeating(
				session,
				session.priceAmount === null ? null : { amount: session.priceAmount, currency: session.currency, legacy: false }
			),
			viewer,
			now: new Date(),
		});
		if (!booking.bookable && booking.reason !== 'started' && booking.reason !== 'full') {
			throw error(404, 'Session not found');
		}

		return { event: withoutPracticalInfo(event), session: mapSession(session, event.timeZone), deposit: depositRuleOf(event), refundPolicy: refundPolicyOf(event), asksDietaryRequirements: (event as { askDietaryRequirements?: boolean }).askDietaryRequirements ?? false, isMockMode: true };
	}

	try {
		const event = await getEventById(params.id);
		// Event access (issue 030): an Event the viewer may not see is not
		// found, and neither is a Seating of it that is unpublished or has
		// no price yet (issue 022) — those cannot be booked.
		if (!eventAccess(toAccessEvent(event), viewer).visible) throw error(404, 'Event not found');
		const found = await loadSeatingAccess(db, params.sessionId);
		if (!found || found.eventId !== event.id) throw error(404, 'Session not found');
		const booking = seatingBooking({ event: found.event, seating: found.access, viewer, now: new Date() });
		if (!booking.bookable && booking.reason !== 'started' && booking.reason !== 'full') {
			throw error(404, 'Session not found');
		}
		const dbSession = await getSessionById(params.sessionId);
		if (!dbSession.price) throw error(404, 'Session not found');

		return {
			// The booking page never carries Practical Info (issue 040) — it is
			// given on the Ticket and in the emails, once the booking is made.
			event: withoutPracticalInfo(event),
			session: {
				id: dbSession.id,
				...seatingTitlesWithFallback(dbSession, { timeZone: event.timeZone }),
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
			// Whether the form asks for Dietary Requirements (issue 041).
			asksDietaryRequirements: event.askDietaryRequirements,
			isMockMode: false
		};
	} catch {
		throw error(404, 'Not found');
	}
};

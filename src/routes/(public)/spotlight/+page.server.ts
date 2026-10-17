import { error } from '@sveltejs/kit';
import { getSpotlightEvent } from '$lib/server/services/events';
import { MOCK_EVENTS, MOCK_SESSIONS, USE_MOCK_DATA } from '$lib/mock-data';
import { getSeatingPrices } from '$lib/server/services/service-pricing';
import { toAccessEvent, toAccessSeating } from '$lib/server/services/event-access';
import { canBeSpotlight, seatingAvailability, viewerOf } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Use mock data if enabled (no database required!)
	if (USE_MOCK_DATA) {
		const spotlightEvent = MOCK_EVENTS.find(e => e.isSpotlight && canBeSpotlight(e)) ?? null;
		if (spotlightEvent) {
			// Attach event sessions to the spotlight event
			const eventSessions = MOCK_SESSIONS.filter(s => s.eventId === spotlightEvent.id);
			return {
				spotlightEvent: {
					// The Spotlight page never carries Practical Info (issue 040).
					...withoutPracticalInfo(spotlightEvent),
					eventSessions
				}
			};
		}
		return { spotlightEvent: null };
	}

	try {
		const spotlightEvent = await getSpotlightEvent();

		// Returns null if no spotlight exists - page should handle fallback
		if (!spotlightEvent) {
			return { spotlightEvent: null };
		}

		// Each Seating with the price it is booked at (its Service's, issue
		// 022) and, from Event access, why it cannot be booked if it cannot.
		const viewer = viewerOf(locals.user);
		const now = new Date();
		const event = toAccessEvent(spotlightEvent);
		const prices = await getSeatingPrices(spotlightEvent.eventSessions.map((s: { id: string }) => s.id));
		return {
			spotlightEvent: {
				...spotlightEvent,
				eventSessions: spotlightEvent.eventSessions.map((s: (typeof spotlightEvent.eventSessions)[number]) => {
					const price = prices.get(s.id) ?? null;
					return {
						...s,
						priceAmount: price?.amount ?? null,
						currency: price?.currency ?? 'EUR',
						...seatingAvailability({ event, seating: toAccessSeating(s, price), viewer, now }),
					};
				}),
			},
		};
	} catch (err) {
		console.error('Failed to fetch spotlight event:', err);
		throw error(500, 'Failed to load spotlight event');
	}
};

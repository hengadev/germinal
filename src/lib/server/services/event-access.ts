import { db } from '../db';
import { events, eventDays, eventServices, eventSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { resolveSeatingPrice, type SeatingPrice } from '$lib/utils/seating-price';
import type { AccessEvent, AccessSeating, Visibility } from '$lib/utils/event-access';

/**
 * The database side of Event access (issue 030): turns rows into the
 * snapshots the pure module `$lib/utils/event-access` decides on, and holds
 * the one SQL condition that mirrors it for paginated listings. No public
 * entry point reads an Event's publication anywhere else.
 */

/** The Event access snapshot of an Event row, with its Booking Window (035). */
export function toAccessEvent(event: {
	visibility: Visibility;
	bookingOpensAt: Date | null;
	bookingClosesHoursBefore: number | null;
}): AccessEvent {
	return {
		visibility: event.visibility,
		bookingWindow: { opensAt: event.bookingOpensAt, closesHoursBefore: event.bookingClosesHoursBefore },
	};
}

/** The Event access snapshot of a Seating row and the price it is booked at. */
export function toAccessSeating(
	seating: { published: boolean; startTime: Date; availableCapacity: number; allowWaitlist: boolean },
	price: SeatingPrice | null
): AccessSeating {
	return {
		published: seating.published,
		priced: price !== null,
		startTime: seating.startTime,
		availableCapacity: seating.availableCapacity,
		allowWaitlist: seating.allowWaitlist,
	};
}

/**
 * SQL for the Events {@link isListed} lets be listed, for queries that page
 * through them. Kept equal to `isListed` by tests/integration/draft-access.
 */
export function listedEventsCondition() {
	return eq(events.visibility, 'public');
}

export interface SeatingAccess {
	seating: typeof eventSessions.$inferSelect;
	eventId: string;
	price: SeatingPrice | null;
	event: AccessEvent;
	access: AccessSeating;
}

/**
 * Load what Event access needs to decide on a Seating, walking Seating →
 * Service → Day → Event. With `lock`, the Seating row is locked for update
 * (call it inside the booking transaction). Null when there is no such
 * Seating.
 */
export async function loadSeatingAccess(
	tx: typeof db,
	seatingId: string,
	{ lock = false }: { lock?: boolean } = {}
): Promise<SeatingAccess | null> {
	const query = tx
		.select({
			seating: eventSessions,
			eventId: events.id,
			eventVisibility: events.visibility,
			bookingOpensAt: events.bookingOpensAt,
			bookingClosesHoursBefore: events.bookingClosesHoursBefore,
			servicePriceAmount: eventServices.priceAmount,
			serviceCurrency: eventServices.currency,
		})
		.from(eventSessions)
		.innerJoin(eventServices, eq(eventSessions.serviceId, eventServices.id))
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.innerJoin(events, eq(eventDays.eventId, events.id))
		.where(eq(eventSessions.id, seatingId))
		.limit(1);

	const [row]: {
		seating: typeof eventSessions.$inferSelect;
		eventId: string;
		eventVisibility: Visibility;
		bookingOpensAt: Date | null;
		bookingClosesHoursBefore: number | null;
		servicePriceAmount: number | null;
		serviceCurrency: string;
	}[] = lock ? await query.for('update', { of: eventSessions }) : await query;

	if (!row) return null;

	const price = resolveSeatingPrice({
		servicePriceAmount: row.servicePriceAmount,
		serviceCurrency: row.serviceCurrency,
		legacyPriceAmount: row.seating.legacyPriceAmount,
		legacyCurrency: row.seating.legacyCurrency,
	});

	return {
		seating: row.seating,
		eventId: row.eventId,
		price,
		event: toAccessEvent({
			visibility: row.eventVisibility,
			bookingOpensAt: row.bookingOpensAt,
			bookingClosesHoursBefore: row.bookingClosesHoursBefore,
		}),
		access: toAccessSeating(row.seating, price),
	};
}

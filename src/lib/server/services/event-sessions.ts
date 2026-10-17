import { db } from '../db';
import { eventSessions, eventServices, eventDays, reservations, events } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { CreateEventSessionInput, UpdateEventSessionInput } from '$lib/types/event-sessions';
import { resolveSeatingPrice } from '$lib/utils/seating-price';
import {
	findOrAttachService,
	recomputeEventDatesFromDays,
} from './event-schedule';
import { dayOf, serviceKindOf } from '$lib/utils/event-time';

/**
 * Define result type for raw SQL query
 */
interface SessionWithEventAndSoldCount {
	id: string;
	event_id: string;
	title_en: string | null;
	title_fr: string | null;
	description_en: string | null;
	description_fr: string | null;
	published: boolean;
	created_at: Date;
	updated_at: Date;
	start_time: Date;
	end_time: Date;
	total_capacity: number;
	available_capacity: number;
	allow_waitlist: boolean;
	badge_type: string;
	// Event fields (prefixed to avoid conflicts)
	events_id: string;
	events_title: string;
	events_description: string;
	// Aggregated count (COUNT returns string in PostgreSQL)
	sold_count: string;
}

/**
 * While an Event has no Days, its hand-entered start/end window is
 * authoritative and Seating times must fall inside it. Once Days exist the
 * Event's dates are derived from them (ADR 0005), so Seatings may open new
 * Days — the dates are then recomputed from the first/last Day.
 */
async function eventHasDays(eventId: string): Promise<boolean> {
	const days = await db.select({ id: eventDays.id })
		.from(eventDays)
		.where(eq(eventDays.eventId, eventId))
		.limit(1);
	return days.length > 0;
}

export async function createEventSession(input: CreateEventSessionInput) {
	const event = await db.query.events.findFirst({
		where: eq(events.id, input.eventId),
		columns: { startDate: true, endDate: true, venueCapacity: true },
	});

	if (!event) {
		throw new Error('Event not found');
	}

	if (
		!await eventHasDays(input.eventId) &&
		(input.startTime < event.startDate || input.endTime > event.endDate)
	) {
		throw new Error('Session times must fall within the event dates');
	}

	// The Seating is attached to its Day and Service (find-or-create) and the
	// Event's derived dates are refreshed in the same transaction, so the
	// schedule is never observable half-built.
	return await db.transaction(async (tx: typeof db) => {
		const serviceId = await findOrAttachService(tx, input.eventId, input.startTime, input.endTime);

		const [session] = await tx.insert(eventSessions).values({
			eventId: input.eventId,
			serviceId,
			titleEn: input.titleEn,
			titleFr: input.titleFr,
			descriptionEn: input.descriptionEn ?? null,
			descriptionFr: input.descriptionFr ?? null,
			startTime: input.startTime,
			endTime: input.endTime,
			totalCapacity: input.totalCapacity,
			availableCapacity: input.totalCapacity,
			// A capacity other than the Venue Capacity is the Seating's own
			// (issue 021); a matching one keeps following the Event.
			capacityOverridden: input.totalCapacity !== event.venueCapacity,
			// Priced from its Service (issue 022): no per-Seating price.
			published: input.published ?? false,
			allowWaitlist: input.allowWaitlist ?? false,
			badgeType: input.badgeType ?? 'none',
		}).returning();

		await recomputeEventDatesFromDays(tx, input.eventId);

		return session;
	});
}

export async function getSessionById(id: string) {
	const session = await db.query.eventSessions.findFirst({
		where: eq(eventSessions.id, id),
		with: {
			event: {
				columns: {
					id: true,
					titleEn: true,
					titleFr: true,
					startDate: true,
					endDate: true,
					timeZone: true,
					currency: true,
				},
			},
			reservations: {
				where: eq(reservations.status, 'confirmed'),
			},
			service: {
				columns: { priceAmount: true },
			},
		},
	});

	if (!session) {
		throw new Error('Session not found');
	}

	// The price the Seating is booked at — its Service's (issue 022), or
	// null while the Service has no price yet.
	const price = resolveSeatingPrice({
		servicePriceAmount: session.service.priceAmount,
		eventCurrency: session.event.currency,
		legacyPriceAmount: session.legacyPriceAmount,
		legacyCurrency: session.legacyCurrency,
	});

	return { ...session, price };
}

export async function getPublishedSessionsByEventId(eventId: string) {
	const sessions = await db.query.eventSessions.findMany({
		where: and(
			eq(eventSessions.eventId, eventId),
			eq(eventSessions.published, true)
		),
		orderBy: [eventSessions.startTime],
		with: {
			service: {
				columns: { priceAmount: true },
			},
			// The Event's currency prices every Seating (issue 042).
			event: {
				columns: { currency: true },
			},
		},
	});

	// Each Seating with the price it is booked at (its Service's, issue 022).
	return sessions.map((session: (typeof sessions)[number]) => ({
		...session,
		price: resolveSeatingPrice({
			servicePriceAmount: session.service.priceAmount,
			eventCurrency: session.event.currency,
			legacyPriceAmount: session.legacyPriceAmount,
			legacyCurrency: session.legacyCurrency,
		}),
	}));
}

export async function getAllSessionsByEventId(eventId: string) {
	const result = await db.execute(sql`
		SELECT
			es.*,
			e.id as events_id,
			e.title_en as events_title,
			e.description_en as events_description,
			COUNT(r.id) as sold_count
		FROM event_sessions es
		LEFT JOIN events e ON e.id = es.event_id
		LEFT JOIN reservations r ON r.event_session_id = es.id
			AND r.status = 'confirmed'
		WHERE es.event_id = ${eventId}
		GROUP BY es.id, e.id
		ORDER BY es.start_time
	`);

	return (result as unknown as SessionWithEventAndSoldCount[]).map((row) => {
		const soldCount = parseInt(row.sold_count, 10);
		return {
			id: row.id,
			eventId: row.event_id,
			event: {
				id: row.events_id,
				title: row.events_title,
				description: row.events_description,
			},
			titleEn: row.title_en,
			titleFr: row.title_fr,
			descriptionEn: row.description_en,
			descriptionFr: row.description_fr,
			startTime: new Date(row.start_time),
			endTime: new Date(row.end_time),
			totalCapacity: row.total_capacity,
			availableCapacity: row.available_capacity,
			allowWaitlist: row.allow_waitlist,
			published: row.published,
			badgeType: (row.badge_type || 'none') as 'none' | 'featured' | 'vip' | 'popular' | 'best_value' | 'limited',
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
			soldCount,
			reservationCount: soldCount,
		};
	});
}

export async function updateEventSession(id: string, input: UpdateEventSessionInput) {
	const session = await getSessionById(id);
	const soldCount = session.reservations.length;

	if (input.startTime !== undefined || input.endTime !== undefined) {
		const effectiveStartTime = input.startTime ?? session.startTime;
		const effectiveEndTime = input.endTime ?? session.endTime;
		if (
			!await eventHasDays(session.eventId) &&
			(effectiveStartTime < session.event.startDate || effectiveEndTime > session.event.endDate)
		) {
			throw new Error('Session times must fall within the event dates');
		}
	}

	return await db.transaction(async (tx: typeof db) => {
		// If the times moved the Seating to another Day or meal, re-attach it
		// to the matching Service. The Day/Service it leaves are kept: Days
		// and Services are picked by the Admin (issue 019) and only the Days
		// picker removes them (issue 020).
		if (input.startTime !== undefined || input.endTime !== undefined) {
			const effectiveStartTime = input.startTime ?? session.startTime;
			const effectiveEndTime = input.endTime ?? session.endTime;
			const parent = await tx.query.eventServices.findFirst({
				where: eq(eventServices.id, session.serviceId),
				with: { day: true },
			});

			const zone = session.event.timeZone;
			const dayMoved = !parent || parent.day.date !== dayOf(effectiveStartTime, zone);
			const kindMoved = !parent || parent.kind !== serviceKindOf(effectiveStartTime, zone);

			if (dayMoved || kindMoved) {
				const serviceId = await findOrAttachService(tx, session.eventId, effectiveStartTime, effectiveEndTime);
				await tx.update(eventSessions)
					.set({ serviceId })
					.where(eq(eventSessions.id, id));
			}
		}

		if (input.totalCapacity !== undefined) {
			if (input.totalCapacity < soldCount) {
				throw new Error(`Cannot reduce capacity below ${soldCount} (already sold)`);
			}

			const [updated] = await tx.update(eventSessions)
				.set({
						...input,
						availableCapacity: input.totalCapacity - soldCount,
						updatedAt: new Date(),
					})
				.where(eq(eventSessions.id, id))
				.returning();

			if (!updated) {
				throw new Error('Session not found');
			}

			if (input.startTime !== undefined || input.endTime !== undefined) {
				await recomputeEventDatesFromDays(tx, session.eventId);
			}

			return updated;
		}

		const [updated] = await tx.update(eventSessions)
			.set({
					...input,
					updatedAt: new Date(),
				})
			.where(eq(eventSessions.id, id))
			.returning();

		if (!updated) {
			throw new Error('Session not found');
		}

		if (input.startTime !== undefined || input.endTime !== undefined) {
			await recomputeEventDatesFromDays(tx, session.eventId);
		}

		return updated;
	});
}

export async function deleteEventSession(id: string) {
	const confirmedReservations = await db.query.reservations.findFirst({
		where: and(
			eq(reservations.eventSessionId, id),
			eq(reservations.status, 'confirmed')
		),
	});

	if (confirmedReservations) {
		throw new Error('Cannot delete session with confirmed reservations');
	}

	// Only the Seating goes: its Day and Service were picked by the Admin
	// and stay until the Days picker removes them (issue 020), so the
	// Event's derived dates are unchanged too.
	await db.transaction(async (tx: typeof db) => {
		const [deleted]: { eventId: string }[] = await tx.delete(eventSessions)
			.where(eq(eventSessions.id, id))
			.returning({ eventId: eventSessions.eventId });
		if (!deleted) return;

	});
}

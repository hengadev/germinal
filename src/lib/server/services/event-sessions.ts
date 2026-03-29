import { db } from '../db';
import { eventSessions, reservations, events } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { CreateEventSessionInput, UpdateEventSessionInput } from '$lib/types/event-sessions';

/**
 * Define result type for raw SQL query
 */
interface SessionWithEventAndSoldCount {
	id: string;
	event_id: string;
	title_en: string;
	title_fr: string;
	description_en: string | null;
	description_fr: string | null;
	published: boolean;
	created_at: Date;
	updated_at: Date;
	start_time: Date;
	end_time: Date;
	total_capacity: number;
	available_capacity: number;
	price_amount: number;
	currency: string;
	allow_waitlist: boolean;
	badge_type: string;
	// Event fields (prefixed to avoid conflicts)
	events_id: string;
	events_title: string;
	events_slug: string;
	events_description: string;
	// Aggregated count (COUNT returns string in PostgreSQL)
	sold_count: string;
}

export async function createEventSession(input: CreateEventSessionInput) {
	const event = await db.query.events.findFirst({
		where: eq(events.id, input.eventId),
		columns: { startDate: true, endDate: true },
	});

	if (!event) {
		throw new Error('Event not found');
	}

	if (input.startTime < event.startDate || input.endTime > event.endDate) {
		throw new Error('Session times must fall within the event dates');
	}

	const [session] = await db.insert(eventSessions).values({
		eventId: input.eventId,
		titleEn: input.titleEn,
		titleFr: input.titleFr,
		descriptionEn: input.descriptionEn ?? null,
		descriptionFr: input.descriptionFr ?? null,
		startTime: input.startTime,
		endTime: input.endTime,
		totalCapacity: input.totalCapacity,
		availableCapacity: input.totalCapacity,
		priceAmount: input.priceAmount,
		currency: input.currency ?? 'EUR',
		published: input.published ?? false,
		allowWaitlist: input.allowWaitlist ?? false,
		badgeType: input.badgeType ?? 'none',
	}).returning();

	return session;
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
					slug: true,
					startDate: true,
					endDate: true,
				},
			},
			reservations: {
				where: eq(reservations.status, 'confirmed'),
			},
		},
	});

	if (!session) {
		throw new Error('Session not found');
	}

	return session;
}

export async function getPublishedSessionsByEventId(eventId: string) {
	const sessions = await db.query.eventSessions.findMany({
		where: and(
			eq(eventSessions.eventId, eventId),
			eq(eventSessions.published, true)
		),
		orderBy: [eventSessions.startTime],
	});

	return sessions;
}

export async function getAllSessionsByEventId(eventId: string) {
	const result = await db.execute(sql`
		SELECT
			es.*,
			e.id as events_id,
			e.title_en as events_title,
			e.slug as events_slug,
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
				slug: row.events_slug,
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
			priceAmount: row.price_amount,
			currency: row.currency,
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
		if (effectiveStartTime < session.event.startDate || effectiveEndTime > session.event.endDate) {
			throw new Error('Session times must fall within the event dates');
		}
	}

	if (input.totalCapacity !== undefined) {
		if (input.totalCapacity < soldCount) {
			throw new Error(`Cannot reduce capacity below ${soldCount} (already sold)`);
		}

		const [updated] = await db.update(eventSessions)
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

		return updated;
	}

	const [updated] = await db.update(eventSessions)
		.set({
				...input,
				updatedAt: new Date(),
			})
		.where(eq(eventSessions.id, id))
		.returning();

	if (!updated) {
		throw new Error('Session not found');
	}

	return updated;
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

	await db.delete(eventSessions).where(eq(eventSessions.id, id));
}

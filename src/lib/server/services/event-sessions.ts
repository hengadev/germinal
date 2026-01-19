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
	title: string;
	description: string | null;
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
	// Event fields (prefixed to avoid conflicts)
	events_id: string;
	events_title: string;
	events_slug: string;
	events_description: string;
	// Aggregated count (COUNT returns string in PostgreSQL)
	sold_count: string;
}

export async function createEventSession(input: CreateEventSessionInput) {
	const [session] = await db.insert(eventSessions).values({
		eventId: input.eventId,
		title: input.title,
		description: input.description ?? null,
		startTime: input.startTime,
		endTime: input.endTime,
		totalCapacity: input.totalCapacity,
		availableCapacity: input.totalCapacity,
		priceAmount: input.priceAmount,
		currency: input.currency ?? 'EUR',
		published: input.published ?? false,
		allowWaitlist: input.allowWaitlist ?? false,
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
					title: true,
					slug: true,
					location: true,
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
	const result = await db.execute<SessionWithEventAndSoldCount[]>(sql`
		SELECT
			es.*,
			e.id as events_id,
			e.title as events_title,
			e.slug as events_slug,
			e.description as events_description,
			COUNT(r.id) as sold_count
		FROM event_sessions es
		LEFT JOIN events e ON e.id = es.event_id
		LEFT JOIN reservations r ON r.event_session_id = es.id
			AND r.status = 'confirmed'
		WHERE es.event_id = ${eventId}
		GROUP BY es.id, e.id
		ORDER BY es.start_time
	`);

	return result.rows.map((row: SessionWithEventAndSoldCount) => {
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
			title: row.title,
			description: row.description,
			startTime: row.start_time,
			endTime: row.end_time,
			totalCapacity: row.total_capacity,
			availableCapacity: row.available_capacity,
			priceAmount: row.price_amount,
			currency: row.currency,
			allowWaitlist: row.allow_waitlist,
			published: row.published,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			soldCount,
			reservationCount: soldCount,
		};
	});
}

export async function updateEventSession(id: string, input: UpdateEventSessionInput) {
	const session = await getSessionById(id);
	const soldCount = session.reservations.length;

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

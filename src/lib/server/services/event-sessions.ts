import { db } from '../db';
import { eventSessions, reservations } from '../db/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import type { CreateEventSessionInput, UpdateEventSessionInput } from '$lib/types/event-sessions';

/**
 * Create a new event session
 */
export async function createEventSession(input: CreateEventSessionInput) {
	const [session] = await db.insert(eventSessions).values({
		eventId: input.eventId,
		title: input.title,
		description: input.description ?? null,
		startTime: input.startTime,
		endTime: input.endTime,
		totalCapacity: input.totalCapacity,
		availableCapacity: input.totalCapacity, // Initialize to total
		priceAmount: input.priceAmount,
		currency: input.currency ?? 'EUR',
		published: input.published ?? false,
		allowWaitlist: input.allowWaitlist ?? false,
	}).returning();

	return session;
}

/**
 * Get session by ID with event details
 */
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
					venueName: true,
					streetAddress: true,
					city: true,
					country: true,
				},
			},
		},
	});

	if (!session) {
		throw new Error('Session not found');
	}

	return session;
}

/**
 * Get published sessions by event ID (for public display)
 */
export async function getPublishedSessionsByEventId(eventId: string) {
	const sessions = await db.query.eventSessions.findMany({
		where: and(
			eq(eventSessions.eventId, eventId),
			eq(eventSessions.published, true),
			gte(eventSessions.startTime, new Date()) // Only future sessions
		),
		orderBy: [eventSessions.startTime],
	});

	return sessions;
}

/**
 * Get all sessions by event ID (for admin)
 */
export async function getAllSessionsByEventId(eventId: string) {
	const sessions = await db.query.eventSessions.findMany({
		where: eq(eventSessions.eventId, eventId),
		orderBy: [eventSessions.startTime],
		with: {
			reservations: {
				where: eq(reservations.status, 'confirmed'),
				columns: {
					id: true,
					quantity: true,
				},
			},
		},
	});

	// Calculate sold count for each session
	return sessions.map(session => ({
		...session,
		soldCount: session.totalCapacity - session.availableCapacity,
		reservationCount: session.reservations.length,
	}));
}

/**
 * Update event session
 */
export async function updateEventSession(id: string, input: UpdateEventSessionInput) {
	// If updating capacity, validate
	if (input.totalCapacity !== undefined) {
		const session = await getSessionById(id);
		const soldCount = session.totalCapacity - session.availableCapacity;

		if (input.totalCapacity < soldCount) {
			throw new Error(`Cannot reduce capacity below ${soldCount} (already sold)`);
		}

		// Update both total and available capacity
		const [updated] = await db.update(eventSessions)
			.set({
				...input,
				availableCapacity: input.totalCapacity - soldCount,
				updatedAt: new Date(),
			})
			.where(eq(eventSessions.id, id))
			.returning();

		return updated;
	}

	// Normal update without capacity change
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

/**
 * Delete event session (only if no confirmed reservations)
 */
export async function deleteEventSession(id: string) {
	// Check for confirmed reservations
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

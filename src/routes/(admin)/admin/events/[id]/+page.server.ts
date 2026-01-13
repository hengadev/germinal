import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_RESERVATIONS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	if (env.USE_MOCK_DATA) {
		// Mock mode - find event in mock data
		const event = MOCK_EVENTS.find((e) => e.id === id);

		if (!event) {
			throw fail(404, { error: 'Event not found' });
		}

		// Mock sessions - empty for now
		const sessions: any[] = [];

		// Mock reservations - filter by event ID
		const reservations = MOCK_RESERVATIONS.filter(r => {
			// In mock data, we'd need to check if the reservation's session belongs to this event
			// For now, return empty array
			return false;
		});

		return { event, sessions, reservations };
	}

	// Database mode - fetch from database
	const { getEventById } = await import('$lib/server/services/events');
	const { getAllSessionsByEventId } = await import('$lib/server/services/event-sessions');
	const { db } = await import('$lib/server/db');
	const { reservations } = await import('$lib/server/db/schema');
	const { desc, eq } = await import('drizzle-orm');

	try {
		const event = await getEventById(id);
		const sessionsData = await getAllSessionsByEventId(id);

		// Get all reservations for this event (through sessions)
		const reservationsData = await db.query.reservations.findMany({
			where: (fields, { inArray }) => {
				const sessionIds = sessionsData.map(s => s.id);
				if (sessionIds.length === 0) {
					return eq(fields.id, 'never-match'); // Return no results if no sessions
				}
				return inArray(fields.eventSessionId, sessionIds);
			},
			orderBy: [desc(reservations.createdAt)],
			with: {
				eventSession: {
					columns: {
						id: true,
						title: true,
						startTime: true
					}
				},
				payment: {
					columns: {
						status: true,
						amount: true,
						currency: true
					}
				}
			}
		});

		return {
			event,
			sessions: sessionsData.map(s => ({
				id: s.id,
				title: s.title,
				description: s.description,
				startTime: s.startTime.toISOString(),
				endTime: s.endTime.toISOString(),
				totalCapacity: s.totalCapacity,
				availableCapacity: s.availableCapacity,
				priceAmount: s.priceAmount,
				currency: s.currency,
				published: s.published,
				allowWaitlist: s.allowWaitlist,
				reservationCount: s._count?.reservations || 0
			})),
			reservations: reservationsData.map(r => ({
				id: r.id,
				guestName: r.guestName,
				guestEmail: r.guestEmail,
				quantity: r.quantity,
				totalAmount: r.totalAmount,
				currency: r.currency,
				status: r.status,
				createdAt: r.createdAt.toISOString(),
				confirmedAt: r.confirmedAt?.toISOString(),
				eventTitle: event.title,
				sessionTitle: r.eventSession.title,
				sessionStartTime: r.eventSession.startTime.toISOString(),
				paymentStatus: r.payment?.status || 'none'
			}))
		};
	} catch (error) {
		throw fail(404, { error: 'Event not found' });
	}
};

export const actions: Actions = {
	// Update event action
	default: async ({ request, params }) => {
		const { id } = params;

		// Validate id
		if (!id) {
			return fail(400, { error: 'Event ID is required' });
		}

		const formData = await request.formData();
		const title = formData.get('title');
		const slug = formData.get('slug');
		const description = formData.get('description');
		const startDate = formData.get('startDate');
		const endDate = formData.get('endDate');
		const location = formData.get('location');
		const published = formData.get('published') === 'true';

		// Validation
		if (!title || typeof title !== 'string') {
			return fail(400, { error: 'Title is required' });
		}

		if (!slug || typeof slug !== 'string') {
			return fail(400, { error: 'Slug is required' });
		}

		if (!description || typeof description !== 'string') {
			return fail(400, { error: 'Description is required' });
		}

		if (!startDate || typeof startDate !== 'string') {
			return fail(400, { error: 'Start date is required' });
		}

		if (!endDate || typeof endDate !== 'string') {
			return fail(400, { error: 'End date is required' });
		}

		if (!location || typeof location !== 'string') {
			return fail(400, { error: 'Location is required' });
		}

		// Validate slug format
		if (!/^[a-z0-9-]+$/.test(slug)) {
			return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
		}

		// Validate dates
		const start = new Date(startDate);
		const end = new Date(endDate);

		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			return fail(400, { error: 'Invalid date format' });
		}

		if (end < start) {
			return fail(400, { error: 'End date must be after start date' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - update in mock data array (not persisted)
			const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);

			if (eventIndex === -1) {
				return fail(404, { error: 'Event not found' });
			}

			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				title,
				slug,
				description,
				startDate: start,
				endDate: end,
				location,
				published,
				updatedAt: new Date()
			};

			return { success: `Event "${title}" updated successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { updateEvent } = await import('$lib/server/services/events');

		try {
			await updateEvent(id, {
				title,
				slug,
				description,
				startDate: start,
				endDate: end,
				location,
				published
			});

			return { success: `Event "${title}" updated successfully` };
		} catch (error) {
			console.error('Error updating event:', error);
			return fail(500, { error: 'Failed to update event. The slug may already be in use.' });
		}
	},

	// Create session action
	createSession: async ({ request, params }) => {
		const formData = await request.formData();

		try {
			const { createEventSession } = await import('$lib/server/services/event-sessions');

			const session = await createEventSession({
				eventId: params.id,
				title: formData.get('title') as string,
				description: formData.get('description') as string || null,
				startTime: new Date(formData.get('startTime') as string),
				endTime: new Date(formData.get('endTime') as string),
				totalCapacity: parseInt(formData.get('totalCapacity') as string),
				priceAmount: parseInt(formData.get('priceAmount') as string),
				currency: formData.get('currency') as string || 'EUR',
				published: formData.get('published') === 'on',
				allowWaitlist: formData.get('allowWaitlist') === 'on'
			});

			return { success: `Session "${session.title}" created successfully` };
		} catch (err) {
			console.error('Create session error:', err);
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to create session' });
		}
	},

	// Update session action
	updateSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			const { updateEventSession } = await import('$lib/server/services/event-sessions');

			await updateEventSession(id, {
				title: formData.get('title') as string,
				description: formData.get('description') as string || null,
				startTime: new Date(formData.get('startTime') as string),
				endTime: new Date(formData.get('endTime') as string),
				totalCapacity: parseInt(formData.get('totalCapacity') as string),
				priceAmount: parseInt(formData.get('priceAmount') as string),
				currency: formData.get('currency') as string,
				published: formData.get('published') === 'on',
				allowWaitlist: formData.get('allowWaitlist') === 'on'
			});

			return { success: 'Session updated successfully' };
		} catch (err) {
			console.error('Update session error:', err);
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update session' });
		}
	},

	// Delete session action
	deleteSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			const { deleteEventSession } = await import('$lib/server/services/event-sessions');

			await deleteEventSession(id);
			return { success: 'Session deleted successfully' };
		} catch (err) {
			console.error('Delete session error:', err);
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete session' });
		}
	}
};

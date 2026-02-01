import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	if (env.USE_MOCK_DATA) {
		// Mock mode - find event in mock data
		const event = MOCK_EVENTS.find((e) => e.id === id);

		if (!event) {
			throw fail(404, { error: 'Event not found' });
		}

		// Mock sessions - return sessions for this event with consistent structure
		const sessions = MOCK_SESSIONS
			.filter(s => s.eventId === id)
			.map(s => ({
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
				reservationCount: MOCK_RESERVATIONS.filter(r => r.eventSessionId === s.id).length
			}));

		// Mock reservations - filter by session IDs that belong to this event
		const sessionIds = sessions.map(s => s.id);
		const reservations = MOCK_RESERVATIONS
			.filter(r => sessionIds.includes(r.eventSessionId))
			.map(r => {
				const session = MOCK_SESSIONS.find(s => s.id === r.eventSessionId);
				const evt = MOCK_EVENTS.find(e => e.id === session?.eventId);
				return {
					id: r.id,
					guestName: r.guestName,
					guestEmail: r.guestEmail,
					quantity: r.quantity,
					totalAmount: r.totalAmount,
					currency: r.currency,
					status: r.status,
					createdAt: r.createdAt,
					confirmedAt: r.confirmedAt,
					eventTitle: evt?.title || '',
					sessionTitle: session?.title || '',
					sessionStartTime: session?.startTime?.toISOString() || '',
					paymentStatus: r.paymentStatus
				};
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
		const titleEn = formData.get('titleEn');
		const titleFr = formData.get('titleFr');
		const slug = formData.get('slug');
		const descriptionEn = formData.get('descriptionEn');
		const descriptionFr = formData.get('descriptionFr');
		const subtitleEn = formData.get('subtitleEn');
		const subtitleFr = formData.get('subtitleFr');
		const startDate = formData.get('startDate');
		const endDate = formData.get('endDate');
		const location = formData.get('location');
		const venueName = formData.get('venueName');
		const streetAddress = formData.get('streetAddress');
		const district = formData.get('district');
		const city = formData.get('city');
		const postalCode = formData.get('postalCode');
		const country = formData.get('country');
		const collaborators = formData.get('collaborators');
		const timings = formData.get('timings');
		const curatorEn = formData.get('curatorEn');
		const curatorFr = formData.get('curatorFr');
		const materialsEn = formData.get('materialsEn');
		const materialsFr = formData.get('materialsFr');
		const admissionInfoEn = formData.get('admissionInfoEn');
		const admissionInfoFr = formData.get('admissionInfoFr');
		const coverMediaId = formData.get('coverMediaId') as string | null;
		const galleryMediaIds = formData.get('galleryMediaIds') as string | null;
		const removedIds = formData.get('removedIds') as string | null;
		const addedIds = formData.get('addedIds') as string | null;
		const published = formData.get('published') === 'true';
		const isSpotlight = formData.get('isSpotlight') === 'true';

		// Parse gallery media IDs
		let galleryIds: string[] = [];
		if (galleryMediaIds) {
			try {
				galleryIds = JSON.parse(galleryMediaIds);
			} catch {
				galleryIds = [];
			}
		}

		// Parse removed and added media IDs
		let removed: string[] = [];
		if (removedIds) {
			try {
				removed = JSON.parse(removedIds);
			} catch {
				removed = [];
			}
		}

		let added: string[] = [];
		if (addedIds) {
			try {
				added = JSON.parse(addedIds);
			} catch {
				added = [];
			}
		}

		// Combine cover and gallery media - cover is first if exists
		const allMediaIds = coverMediaId
			? [coverMediaId, ...galleryIds.filter(id => id !== coverMediaId)]
			: galleryIds;

		// Validation
		if (!titleEn || typeof titleEn !== 'string') {
			return fail(400, { error: 'Title (English) is required' });
		}

		if (!titleFr || typeof titleFr !== 'string') {
			return fail(400, { error: 'Title (French) is required' });
		}

		if (!slug || typeof slug !== 'string') {
			return fail(400, { error: 'Slug is required' });
		}

		if (!descriptionEn || typeof descriptionEn !== 'string') {
			return fail(400, { error: 'Description (English) is required' });
		}

		if (!descriptionFr || typeof descriptionFr !== 'string') {
			return fail(400, { error: 'Description (French) is required' });
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

			// If isSpotlight is true, unset others in mock array
			if (isSpotlight) {
				MOCK_EVENTS.forEach(e => e.isSpotlight = false);
			}

			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				titleEn,
				titleFr,
				slug,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn || null,
				subtitleFr: subtitleFr || null,
				startDate: start,
				endDate: end,
				location,
				venueName: venueName || null,
				streetAddress: streetAddress || null,
				district: district || null,
				city: city || null,
				postalCode: postalCode || null,
				country: country || null,
				collaborators: collaborators || null,
				timings: timings || null,
				curatorEn: curatorEn || null,
				curatorFr: curatorFr || null,
				materialsEn: materialsEn || null,
				materialsFr: materialsFr || null,
				admissionInfoEn: admissionInfoEn || null,
				admissionInfoFr: admissionInfoFr || null,
				coverMediaId: coverMediaId || null,
				published,
				isSpotlight,
				updatedAt: new Date()
			};

			return { success: `Event "${titleEn}" updated successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { updateEvent } = await import('$lib/server/services/events');
		const { db } = await import('$lib/server/db');
		const { media } = await import('$lib/server/db/schema');
		const { eq, and } = await import('drizzle-orm');
		const { deleteMedia } = await import('$lib/server/services/media');

		try {
			// Update event fields
			await updateEvent(id, {
				titleEn,
				titleFr,
				slug,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn || null,
				subtitleFr: subtitleFr || null,
				startDate: start,
				endDate: end,
				location,
				venueName: venueName || null,
				streetAddress: streetAddress || null,
				district: district || null,
				city: city || null,
				postalCode: postalCode || null,
				country: country || null,
				collaborators: collaborators || null,
				timings: timings || null,
				curatorEn: curatorEn || null,
				curatorFr: curatorFr || null,
				materialsEn: materialsEn || null,
				materialsFr: materialsFr || null,
				admissionInfoEn: admissionInfoEn || null,
				admissionInfoFr: admissionInfoFr || null,
				coverMediaId: coverMediaId || null,
				published,
				isSpotlight
			});

			// Delete removed media
			for (const mediaId of removed) {
				try {
					await deleteMedia(mediaId);
				} catch (err) {
					logger.error(`Failed to delete media ${mediaId}:`, err);
				}
			}

			// Reset all cover flags for this event
			await db.update(media)
				.set({ isCover: false })
				.where(eq(media.eventId, id));

			// Link new media to event and set cover flag
			for (let i = 0; i < allMediaIds.length; i++) {
				const mediaId = allMediaIds[i];
				const isCover = i === 0; // First image is cover
				await db.update(media)
					.set({ eventId: id, isCover })
					.where(eq(media.id, mediaId));
			}

			return { success: `Event "${titleEn}" updated successfully` };
		} catch (error) {
			logger.error('Error updating event:', error);
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
			logger.error('Create session error:', err);
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
			logger.error('Update session error:', err);
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
			logger.error('Delete session error:', err);
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete session' });
		}
	}
};

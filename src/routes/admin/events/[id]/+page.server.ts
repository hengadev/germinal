import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	if (env.USE_MOCK_DATA) {
		// Mock mode - find event in mock data
		const event = MOCK_EVENTS.find((e) => e.id === id);

		if (!event) {
			throw fail(404, { error: 'Event not found' });
		}

		return { event };
	}

	// Database mode - fetch from database
	const { getEventById } = await import('$lib/server/services/events');

	try {
		const event = await getEventById(id);
		return { event };
	} catch (error) {
		throw fail(404, { error: 'Event not found' });
	}
};

export const actions: Actions = {
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
	}
};

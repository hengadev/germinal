import { fail, redirect, type Actions } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
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
			// Mock mode - add to mock data array (not persisted)
			const createMockMedia = (url: string, type: 'image' | 'video' = 'image') => ({
				id: `mock-media-${Math.random().toString(36).substr(2, 9)}`,
				type,
				url,
				s3Key: `mock/${url.split('/').pop()}`,
				mimeType: type === 'image' ? 'image/jpeg' : 'video/mp4',
				size: 1234567,
				eventId: null as string | null,
				talentId: null as string | null,
				isCover: false,
				createdAt: new Date()
			});

			const newEvent = {
				id: String(MOCK_EVENTS.length + 1),
				title,
				slug,
				description,
				startDate: start,
				endDate: end,
				location,
				published,
				createdAt: new Date(),
				updatedAt: new Date(),
				coverMediaId: null,
				coverMedia: createMockMedia('https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2670&auto=format&fit=crop'),
				media: [] as ReturnType<typeof createMockMedia>[]
			} as typeof MOCK_EVENTS[number];

			MOCK_EVENTS.push(newEvent);

			return { success: `Event "${title}" created successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { createEvent } = await import('$lib/server/services/events');

		try {
			await createEvent({
				title,
				slug,
				description,
				startDate: start,
				endDate: end,
				location,
				coverMediaId: null,
				published
			});

			return { success: `Event "${title}" created successfully` };
		} catch (error) {
			console.error('Error creating event:', error);
			return fail(500, { error: 'Failed to create event. The slug may already be in use.' });
		}
	}
};

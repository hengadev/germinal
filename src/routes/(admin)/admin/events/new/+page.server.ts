import { fail, redirect, type Actions } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { getAllCategories } = await import('$lib/server/services/categories');
	const categories = await getAllCategories({ publishedOnly: true });
	return { categories };
};

export const actions: Actions = {
	default: async ({ request }) => {
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
		const categoryId = formData.get('categoryId') as string | null;
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

			// If isSpotlight is true, unset others in mock array
			if (isSpotlight) {
				MOCK_EVENTS.forEach(e => e.isSpotlight = false);
			}

			const newEvent = {
				id: String(MOCK_EVENTS.length + 1),
				titleEn,
				titleFr,
				slug,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
				startDate: start,
				endDate: end,
				location,
				venueName: venueName?.toString() || null,
				streetAddress: streetAddress?.toString() || null,
				district: district?.toString() || null,
				city: city?.toString() || null,
				postalCode: postalCode?.toString() || null,
				country: country?.toString() || null,
				collaborators: collaborators?.toString() || null,
				timings: timings?.toString() || null,
				curatorEn: curatorEn?.toString() || null,
				curatorFr: curatorFr?.toString() || null,
				materialsEn: materialsEn?.toString() || null,
				materialsFr: materialsFr?.toString() || null,
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				published,
				isSpotlight,
				createdAt: new Date(),
				updatedAt: new Date(),
				coverMediaId: coverMediaId || null,
				coverMedia: coverMediaId ? { id: coverMediaId, url: '' } : createMockMedia('https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2670&auto=format&fit=crop'),
				media: allMediaIds.map(id => createMockMedia(`https://picsum.photos/seed/${id}/800/600`))
			} as typeof MOCK_EVENTS[number];

			MOCK_EVENTS.push(newEvent);

			return { success: `Event "${titleEn}" created successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { createEvent } = await import('$lib/server/services/events');
		const { db } = await import('$lib/server/db');
		const { media } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');

		try {
			// Create event
			const event = await createEvent({
				titleEn,
				titleFr,
				slug,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
				startDate: start,
				endDate: end,
				location,
				venueName: venueName?.toString() || null,
				streetAddress: streetAddress?.toString() || null,
				district: district?.toString() || null,
				city: city?.toString() || null,
				postalCode: postalCode?.toString() || null,
				country: country?.toString() || null,
				collaborators: collaborators?.toString() || null,
				timings: timings?.toString() || null,
				curatorEn: curatorEn?.toString() || null,
				curatorFr: curatorFr?.toString() || null,
				materialsEn: materialsEn?.toString() || null,
				materialsFr: materialsFr?.toString() || null,
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				coverMediaId: coverMediaId || null,
				categoryId: categoryId || null,
				published,
				isSpotlight
			});

			// Link media to event
			for (let i = 0; i < allMediaIds.length; i++) {
				const mediaId = allMediaIds[i];
				const isCover = i === 0; // First image is cover
				await db.update(media)
					.set({ eventId: event.id, isCover })
					.where(eq(media.id, mediaId));
			}

			return { success: `Event "${titleEn}" created successfully` };
		} catch (error) {
			console.error('Error creating event:', error);
			return fail(500, { error: 'Failed to create event. The slug may already be in use.' });
		}
	}
};

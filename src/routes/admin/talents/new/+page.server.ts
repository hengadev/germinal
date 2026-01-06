import { fail, type Actions } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_TALENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const firstName = formData.get('firstName');
		const lastName = formData.get('lastName');
		const role = formData.get('role');
		const bio = formData.get('bio');
		const instagram = formData.get('instagram');
		const linkedin = formData.get('linkedin');
		const twitter = formData.get('twitter');
		const website = formData.get('website');
		const published = formData.get('published') === 'true';

		// Validation
		if (!firstName || typeof firstName !== 'string') {
			return fail(400, { error: 'First name is required' });
		}

		if (!lastName || typeof lastName !== 'string') {
			return fail(400, { error: 'Last name is required' });
		}

		if (!role || typeof role !== 'string') {
			return fail(400, { error: 'Role is required' });
		}

		if (!bio || typeof bio !== 'string') {
			return fail(400, { error: 'Bio is required' });
		}

		// Build social links object
		const socialLinks: Record<string, string> = {};
		if (instagram && typeof instagram === 'string' && instagram.trim()) {
			socialLinks.instagram = instagram.trim();
		}
		if (linkedin && typeof linkedin === 'string' && linkedin.trim()) {
			socialLinks.linkedin = linkedin.trim();
		}
		if (twitter && typeof twitter === 'string' && twitter.trim()) {
			socialLinks.twitter = twitter.trim();
		}
		if (website && typeof website === 'string' && website.trim()) {
			socialLinks.website = website.trim();
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

			const newTalent = {
				id: String(MOCK_TALENTS.length + 1),
				firstName,
				lastName,
				role,
				bio,
				socialLinks: JSON.stringify(socialLinks),
				published,
				createdAt: new Date(),
				updatedAt: new Date(),
				profileMediaId: null,
				profileMedia: createMockMedia('https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2564&auto=format&fit=crop'),
				media: [] as ReturnType<typeof createMockMedia>[]
			} as typeof MOCK_TALENTS[number];

			MOCK_TALENTS.push(newTalent);

			return { success: `Talent "${firstName} ${lastName}" added successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { createTalent } = await import('$lib/server/services/talents');

		try {
			await createTalent({
				firstName,
				lastName,
				role,
				bio,
				socialLinks: JSON.stringify(socialLinks),
				profileMediaId: null,
				published
			});

			return { success: `Talent "${firstName} ${lastName}" added successfully` };
		} catch (error) {
			console.error('Error creating talent:', error);
			return fail(500, { error: 'Failed to create talent' });
		}
	}
};

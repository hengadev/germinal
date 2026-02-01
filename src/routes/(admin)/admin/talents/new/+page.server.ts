import { fail, type Actions } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
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
		const roleEn = formData.get('roleEn');
		const roleFr = formData.get('roleFr');
		const bioEn = formData.get('bioEn');
		const bioFr = formData.get('bioFr');
		const city = formData.get('city');
		const country = formData.get('country');
		const quoteEn = formData.get('quoteEn');
		const quoteFr = formData.get('quoteFr');
		const specializationsEn = formData.get('specializationsEn');
		const specializationsFr = formData.get('specializationsFr');
		const instagram = formData.get('instagram');
		const linkedin = formData.get('linkedin');
		const twitter = formData.get('twitter');
		const website = formData.get('website');
		const profileMediaId = formData.get('profileMediaId') as string | null;
		const published = formData.get('published') === 'true';

		// Validation
		if (!firstName || typeof firstName !== 'string') {
			return fail(400, { error: 'First name is required' });
		}

		if (!lastName || typeof lastName !== 'string') {
			return fail(400, { error: 'Last name is required' });
		}

		if (!roleEn || typeof roleEn !== 'string') {
			return fail(400, { error: 'Role (English) is required' });
		}

		if (!roleFr || typeof roleFr !== 'string') {
			return fail(400, { error: 'Role (French) is required' });
		}

		if (!bioEn || typeof bioEn !== 'string') {
			return fail(400, { error: 'Bio (English) is required' });
		}

		if (!bioFr || typeof bioFr !== 'string') {
			return fail(400, { error: 'Bio (French) is required' });
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
				roleEn,
				roleFr,
				bioEn,
				bioFr,
				city,
				country,
				quoteEn,
				quoteFr,
				specializationsEn: specializationsEn || null,
				specializationsFr: specializationsFr || null,
				socialLinks: JSON.stringify(socialLinks),
				published,
				createdAt: new Date(),
				updatedAt: new Date(),
				profileMediaId: null,
				profileMedia: profileMediaId ? { id: profileMediaId, url: '' } : createMockMedia('https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2564&auto=format&fit=crop'),
				media: [] as ReturnType<typeof createMockMedia>[]
			} as typeof MOCK_TALENTS[number];

			MOCK_TALENTS.push(newTalent);

			return { success: `Talent "${firstName} ${lastName}" added successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { createTalent } = await import('$lib/server/services/talents');
		const { db } = await import('$lib/server/db');
		const { media } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');

		try {
			// Create talent with profileMediaId
			const talent = await createTalent({
				firstName,
				lastName,
				roleEn,
				roleFr,
				bioEn,
				bioFr,
				city: city || null,
				country: country || null,
				quoteEn: quoteEn || null,
				quoteFr: quoteFr || null,
				specializationsEn: specializationsEn || null,
				specializationsFr: specializationsFr || null,
				socialLinks: JSON.stringify(socialLinks),
				profileMediaId: profileMediaId || null,
				published
			});

			// Link media to talent (update media records that were uploaded but not linked)
			if (profileMediaId) {
				await db.update(media)
					.set({ talentId: talent.id, isCover: true })
					.where(eq(media.id, profileMediaId));
			}

			return { success: `Talent "${firstName} ${lastName}" added successfully` };
		} catch (error) {
			logger.error('Error creating talent:', error);
			return fail(500, { error: 'Failed to create talent' });
		}
	}
};

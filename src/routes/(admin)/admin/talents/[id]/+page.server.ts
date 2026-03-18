import { fail, type Actions } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_TALENTS, MOCK_TALENT_CATEGORIES } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	let talent;
	let categories;

	if (env.USE_MOCK_DATA) {
		// Mock mode - find talent in mock data
		const foundTalent = MOCK_TALENTS.find((t) => t.id === id);

		if (!foundTalent) {
			throw fail(404, { error: 'Talent not found' });
		}

		// Parse social links
		const socialLinks = foundTalent.socialLinks
			? JSON.parse(foundTalent.socialLinks)
			: {};

		talent = {
			...foundTalent,
			socialLinks
		};
		categories = MOCK_TALENT_CATEGORIES;
	} else {
		// Database mode - fetch from database
		const { getTalentById } = await import('$lib/server/services/talents');
		const { getAllTalentCategories } = await import('$lib/server/services/talent-categories');

		try {
			const talentData = await getTalentById(id);
			const socialLinks = talentData.socialLinks
				? JSON.parse(talentData.socialLinks)
				: {};

			talent = {
				...talentData,
				socialLinks
			};
		} catch (error) {
			throw fail(404, { error: 'Talent not found' });
		}

		const categoriesData = await getAllTalentCategories({ publishedOnly: false });
		categories = categoriesData;
	}

	return { talent, categories };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const { id } = params;

		// Validate id
		if (!id) {
			return fail(400, { error: 'Talent ID is required' });
		}

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
		const categoryId = formData.get('categoryId');
		const instagram = formData.get('instagram');
		const linkedin = formData.get('linkedin');
		const twitter = formData.get('twitter');
		const website = formData.get('website');
		const mediaAction = formData.get('mediaAction');
		const existingMediaId = formData.get('existingMediaId') as string | null;
		const newMediaId = formData.get('newMediaId') as string | null;
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
			// Mock mode - update in mock data array (not persisted)
			const talentIndex = MOCK_TALENTS.findIndex((t) => t.id === id);

			if (talentIndex === -1) {
				return fail(404, { error: 'Talent not found' });
			}

			MOCK_TALENTS[talentIndex] = {
				...MOCK_TALENTS[talentIndex],
				firstName,
				lastName,
				roleEn,
				roleFr,
				bioEn,
				bioFr,
				city: city?.toString() || null,
				country: country?.toString() || null,
				quoteEn: quoteEn?.toString() || null,
				quoteFr: quoteFr?.toString() || null,
				specializationsEn: specializationsEn?.toString() || null,
				specializationsFr: specializationsFr?.toString() || null,
				categoryId: categoryId?.toString() || null,
				socialLinks: JSON.stringify(socialLinks),
				profileMediaId: mediaAction === 'replaced' && newMediaId ? newMediaId :
				               mediaAction === 'removed' ? null :
				               MOCK_TALENTS[talentIndex].profileMediaId,
				published,
				updatedAt: new Date()
			} as typeof MOCK_TALENTS[number];

			return { success: `Talent "${firstName} ${lastName}" updated successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { updateTalent } = await import('$lib/server/services/talents');
		const { db } = await import('$lib/server/db');
		const { media } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { deleteMedia } = await import('$lib/server/services/media');

		try {
			// Update talent fields
			await updateTalent(id, {
				firstName,
				lastName,
				roleEn,
				roleFr,
				bioEn,
				bioFr,
				city: city?.toString() || null,
				country: country?.toString() || null,
				quoteEn: quoteEn?.toString() || null,
				quoteFr: quoteFr?.toString() || null,
				specializationsEn: specializationsEn?.toString() || null,
				specializationsFr: specializationsFr?.toString() || null,
				categoryId: categoryId?.toString() || null,
				socialLinks: JSON.stringify(socialLinks),
				profileMediaId: mediaAction === 'replaced' && newMediaId ? newMediaId :
				               mediaAction === 'removed' ? null :
				               existingMediaId,
				published
			});

			// Handle media changes
			if (mediaAction === 'replaced') {
				// Delete old media
				if (existingMediaId) {
					try {
						await deleteMedia(existingMediaId);
					} catch (err) {
						logger.error({ err }, 'Failed to delete old media');
					}
				}
				// Link new media to talent
				if (newMediaId) {
					await db.update(media)
						.set({ talentId: id, isCover: true })
						.where(eq(media.id, newMediaId));
				}
			} else if (mediaAction === 'removed') {
				// Delete current profile media
				if (existingMediaId) {
					try {
						await deleteMedia(existingMediaId);
					} catch (err) {
						logger.error({ err }, 'Failed to delete media');
					}
				}
			}

			return { success: `Talent "${firstName} ${lastName}" updated successfully` };
		} catch (error) {
			logger.error({ err: error }, 'Error updating talent');
			return fail(500, { error: 'Failed to update talent' });
		}
	}
};

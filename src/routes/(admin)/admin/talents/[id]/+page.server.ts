import { fail, type Actions } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth-guards';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_TALENTS, MOCK_TALENT_CATEGORIES } from '$lib/mock-data';
import { parseTalentForm, talentFormIdsSchema } from '$lib/server/validators/talents';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	let talent;
	let categories;

	if (env.USE_MOCK_DATA) {
		// Mock mode - find talent in mock data
		const foundTalent = MOCK_TALENTS.find((t) => t.id === id);

		if (!foundTalent) {
			throw fail(404, { error: 'Talent introuvable' });
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
			throw fail(404, { error: 'Talent introuvable' });
		}

		const categoriesData = await getAllTalentCategories({ publishedOnly: false });
		categories = categoriesData;
	}

	return { talent, categories };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;

		// Validate id
		if (!id) {
			return fail(400, { error: 'L’identifiant du talent est requis' });
		}

		const formData = await request.formData();
		const mediaAction = formData.get('mediaAction');
		const existingMediaId = formData.get('existingMediaId') as string | null;
		const newMediaId = formData.get('newMediaId') as string | null;
		const categoryId = (formData.get('categoryId') as string | null) || null;

		// Same schema as the Talent API (social links: absolute http(s) URLs only)
		const form = parseTalentForm(formData);
		if (!form.success) {
			return fail(400, { error: form.error });
		}
		const fields = form.data;
		const { firstName, lastName } = fields;

		if (env.USE_MOCK_DATA) {
			// Mock mode - update in mock data array (not persisted)
			const talentIndex = MOCK_TALENTS.findIndex((t) => t.id === id);

			if (talentIndex === -1) {
				return fail(404, { error: 'Talent introuvable' });
			}

			MOCK_TALENTS[talentIndex] = {
				...MOCK_TALENTS[talentIndex],
				...fields,
				categoryId,
				profileMediaId: mediaAction === 'replaced' && newMediaId ? newMediaId :
				               mediaAction === 'removed' ? null :
				               MOCK_TALENTS[talentIndex].profileMediaId,
				updatedAt: new Date()
			} as typeof MOCK_TALENTS[number];

			return { success: `Talent « ${firstName} ${lastName} » mis à jour (mode démo, non enregistré)` };
		}

		// Database mode - use actual database functions
		const { updateTalent } = await import('$lib/server/services/talents');
		const { db } = await import('$lib/server/db');
		const { media } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { deleteMedia } = await import('$lib/server/services/media');

		// The category id is validated like the API's (mock data has non-UUID ids, so only here)
		const ids = talentFormIdsSchema.safeParse({ categoryId: categoryId ?? undefined });
		if (!ids.success) {
			return fail(400, { error: 'Identifiant de catégorie invalide' });
		}

		try {
			// Update talent fields
			await updateTalent(id, {
				...fields,
				categoryId: ids.data.categoryId,
				profileMediaId: mediaAction === 'replaced' && newMediaId ? newMediaId :
				               mediaAction === 'removed' ? null :
				               existingMediaId
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

			return { success: `Talent « ${firstName} ${lastName} » mis à jour` };
		} catch (error) {
			logger.error({ err: error }, 'Error updating talent');
			return fail(500, { error: 'Échec de la mise à jour du talent' });
		}
	}
};

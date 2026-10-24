import { fail, type Actions } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth-guards';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_TALENTS, MOCK_TALENT_CATEGORIES } from '$lib/mock-data';
import { parseTalentForm, talentFormIdsSchema, type TalentFormFields } from '$lib/server/validators/talents';
import { translateTalent, type TalentText } from '$lib/server/services/talent-translation';
import { getTranslator, isTranslationEnabled } from '$lib/server/services/translator';
import type { PageServerLoad } from './$types';

/** The form's fields with their English generated from the French (DeepL). */
async function withEnglish(fields: TalentFormFields, stored: TalentText | null) {
	const english = await translateTalent(fields, stored, getTranslator());
	if (english.translationFailed) {
		logger.error({ err: english.error }, 'Talent English translation failed');
	}
	return english;
}

const TRANSLATION_FAILED = ' (la traduction anglaise a échoué : elle sera retentée au prochain enregistrement)';

export const load: PageServerLoad = async () => {
	const englishAuto = isTranslationEnabled();
	if (env.USE_MOCK_DATA) {
		return { categories: MOCK_TALENT_CATEGORIES, englishAuto };
	}
	const { getAllTalentCategories } = await import('$lib/server/services/talent-categories');
	const categories = await getAllTalentCategories({ publishedOnly: true });
	return { categories, englishAuto };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();

		// Same schema as the Talent API (social links: absolute http(s) URLs only)
		const form = parseTalentForm(formData);
		if (!form.success) {
			return fail(400, { error: form.error });
		}
		const english = await withEnglish(form.data, null);
		const fields = english.value;
		const note = english.translationFailed ? TRANSLATION_FAILED : '';
		const { firstName, lastName } = fields;
		const profileMediaId = (formData.get('profileMediaId') as string | null) || null;
		const categoryId = (formData.get('categoryId') as string | null) || null;

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
				...fields,
				createdAt: new Date(),
				updatedAt: new Date(),
				profileMediaId: null,
				profileMedia: profileMediaId ? { id: profileMediaId, url: '' } : createMockMedia('https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2564&auto=format&fit=crop'),
				media: [] as ReturnType<typeof createMockMedia>[]
			} as typeof MOCK_TALENTS[number];

			MOCK_TALENTS.push(newTalent);

			return { success: `Talent « ${firstName} ${lastName} » ajouté (mode démo, non enregistré)${note}` };
		}

		// Database mode - use actual database functions
		const { createTalent } = await import('$lib/server/services/talents');
		const { db } = await import('$lib/server/db');
		const { media } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');

		// Ids are validated like the API's (mock data has non-UUID ids, so only here)
		const ids = talentFormIdsSchema.safeParse({
			profileMediaId: profileMediaId ?? undefined,
			categoryId: categoryId ?? undefined
		});
		if (!ids.success) {
			return fail(400, { error: 'Identifiant de média ou de catégorie invalide' });
		}

		try {
			// Create talent with profileMediaId
			const talent = await createTalent({ ...fields, ...ids.data });

			// Link media to talent (update media records that were uploaded but not linked)
			if (profileMediaId) {
				await db.update(media)
					.set({ talentId: talent.id, isCover: true })
					.where(eq(media.id, profileMediaId));
			}

			return { success: `Talent « ${firstName} ${lastName} » ajouté${note}` };
		} catch (error) {
			logger.error({ err: error }, 'Error creating talent');
			return fail(500, { error: 'Échec de la création du talent' });
		}
	}
};

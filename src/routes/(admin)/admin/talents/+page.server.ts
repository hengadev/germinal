import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_TALENTS, MOCK_TALENT_CATEGORIES } from '$lib/mock-data';
import type { TalentWithMedia } from '$lib/types/talents';

export const load: PageServerLoad = async () => {
	throw redirect(302, '/admin/team');
	if (env.USE_MOCK_DATA) {
		// Mock mode - return all talents (published and unpublished)
		return {
			talents: MOCK_TALENTS as unknown as TalentWithMedia[],
			categories: MOCK_TALENT_CATEGORIES
		};
	}

	// Database mode - import and use actual database functions
	const { getAllTalents } = await import('$lib/server/services/talents');
	const { getAllTalentCategories } = await import('$lib/server/services/talent-categories');
	const [result, categories] = await Promise.all([
		getAllTalents({ publishedOnly: false }),
		getAllTalentCategories({ publishedOnly: false })
	]);

	return {
		talents: result.data as TalentWithMedia[],
		categories
	};
};

export const actions: Actions = {
	/**
	 * Update an existing talent
	 */
	updateTalent: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const firstName = formData.get('firstName');
		const lastName = formData.get('lastName');
		const roleEn = formData.get('roleEn');
		const roleFr = formData.get('roleFr');
		const bioEn = formData.get('bioEn');
		const bioFr = formData.get('bioFr');
		const categoryId = formData.get('categoryId');
		const instagram = formData.get('instagram');
		const linkedin = formData.get('linkedin');
		const twitter = formData.get('twitter');
		const website = formData.get('website');
		const published = formData.get('published') === 'true';

		// Validate id
		if (!id || typeof id !== 'string') {
			return fail(400, { error: 'Talent ID is required' });
		}

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
				socialLinks: JSON.stringify(socialLinks),
				published,
				updatedAt: new Date()
			} as typeof MOCK_TALENTS[number];

			return { success: `Talent "${firstName} ${lastName}" updated successfully` };
		}

		// Database mode - use actual database functions
		const { updateTalent } = await import('$lib/server/services/talents');

		try {
			await updateTalent(id, {
				firstName,
				lastName,
				roleEn,
				roleFr,
				bioEn,
				bioFr,
				socialLinks: JSON.stringify(socialLinks),
				categoryId: categoryId?.toString() || null,
				published
			});

			return { success: `Talent "${firstName} ${lastName}" updated successfully` };
		} catch (error) {
			logger.error({ err: error }, 'Error updating talent');
			return fail(500, { error: 'Failed to update talent' });
		}
	},

	/**
	 * Create a new talent category
	 */
	createCategory: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name');
		const displayNameEn = formData.get('displayNameEn');
		const displayNameFr = formData.get('displayNameFr');
		const slug = formData.get('slug');
		const description = formData.get('description');
		const icon = formData.get('icon');
		const color = formData.get('color');
		const sortOrder = formData.get('sortOrder');
		const published = formData.get('published') === 'true';

		if (!name || typeof name !== 'string') return fail(400, { error: 'Name is required' });
		if (!displayNameEn || typeof displayNameEn !== 'string') return fail(400, { error: 'Display name (English) is required' });
		if (!displayNameFr || typeof displayNameFr !== 'string') return fail(400, { error: 'Display name (French) is required' });
		if (!slug || typeof slug !== 'string') return fail(400, { error: 'Slug is required' });
		if (!/^[a-z0-9-]+$/.test(slug)) return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });

		if (env.USE_MOCK_DATA) {
			const newCategory = {
				id: String(MOCK_TALENT_CATEGORIES.length + 1),
				name,
				displayNameEn,
				displayNameFr,
				slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published,
				createdAt: new Date(),
				updatedAt: new Date(),
				talentCount: 0
			} as typeof MOCK_TALENT_CATEGORIES[number];
			MOCK_TALENT_CATEGORIES.push(newCategory);
			return { success: `Category "${displayNameEn}" created successfully` };
		}

		const { createTalentCategory } = await import('$lib/server/services/talent-categories');
		try {
			await createTalentCategory({
				name, displayNameEn, displayNameFr, slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published
			});
			return { success: `Category "${displayNameEn}" created successfully` };
		} catch (error) {
			logger.error({ err: error }, 'Error creating talent category');
			return fail(500, { error: 'Failed to create category. The slug may already be in use.' });
		}
	},

	/**
	 * Update an existing talent category
	 */
	updateCategory: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const name = formData.get('name');
		const displayNameEn = formData.get('displayNameEn');
		const displayNameFr = formData.get('displayNameFr');
		const slug = formData.get('slug');
		const description = formData.get('description');
		const icon = formData.get('icon');
		const color = formData.get('color');
		const sortOrder = formData.get('sortOrder');
		const published = formData.get('published') === 'true';

		if (!id || typeof id !== 'string') return fail(400, { error: 'Category ID is required' });
		if (!name || typeof name !== 'string') return fail(400, { error: 'Name is required' });
		if (!displayNameEn || typeof displayNameEn !== 'string') return fail(400, { error: 'Display name (English) is required' });
		if (!displayNameFr || typeof displayNameFr !== 'string') return fail(400, { error: 'Display name (French) is required' });
		if (!slug || typeof slug !== 'string') return fail(400, { error: 'Slug is required' });
		if (!/^[a-z0-9-]+$/.test(slug)) return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });

		if (env.USE_MOCK_DATA) {
			const idx = MOCK_TALENT_CATEGORIES.findIndex((c) => c.id === id);
			if (idx === -1) return fail(404, { error: 'Category not found' });
			MOCK_TALENT_CATEGORIES[idx] = {
				...MOCK_TALENT_CATEGORIES[idx],
				name, displayNameEn, displayNameFr, slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published,
				updatedAt: new Date()
			} as typeof MOCK_TALENT_CATEGORIES[number];
			return { success: `Category "${displayNameEn}" updated successfully` };
		}

		const { updateTalentCategory } = await import('$lib/server/services/talent-categories');
		try {
			await updateTalentCategory(id, {
				name, displayNameEn, displayNameFr, slug,
				description: description?.toString() || null,
				icon: icon?.toString() || null,
				color: color?.toString() || null,
				sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
				published
			});
			return { success: `Category "${displayNameEn}" updated successfully` };
		} catch (error) {
			logger.error({ err: error }, 'Error updating talent category');
			return fail(500, { error: 'Failed to update category' });
		}
	},

	/**
	 * Delete a talent category
	 */
	deleteCategory: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') return fail(400, { error: 'Category ID is required' });

		if (env.USE_MOCK_DATA) {
			const idx = MOCK_TALENT_CATEGORIES.findIndex((c) => c.id === id);
			if (idx === -1) return fail(404, { error: 'Category not found' });
			const category = MOCK_TALENT_CATEGORIES[idx];
			if (category.talentCount > 0) return fail(400, { error: 'Cannot delete category with associated talents' });
			MOCK_TALENT_CATEGORIES.splice(idx, 1);
			return { success: `Category "${category.displayNameEn}" deleted successfully` };
		}

		const { deleteTalentCategory } = await import('$lib/server/services/talent-categories');
		try {
			await deleteTalentCategory(id);
			return { success: 'Category deleted successfully' };
		} catch (error) {
			logger.error({ err: error }, 'Error deleting talent category');
			if (error instanceof Error && error.message.includes('Cannot delete category with associated talents')) {
				return fail(400, { error: error.message });
			}
			return fail(500, { error: 'Failed to delete category' });
		}
	},

	/**
	 * Delete a talent
	 */
	deleteTalent: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { error: 'Talent ID is required' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - remove from mock data array (not persisted)
			const talentIndex = MOCK_TALENTS.findIndex((t) => t.id === id);

			if (talentIndex === -1) {
				return fail(404, { error: 'Talent not found' });
			}

			const talent = MOCK_TALENTS[talentIndex];
			MOCK_TALENTS.splice(talentIndex, 1);

			return { success: `Talent "${talent.firstName} ${talent.lastName}" deleted successfully` };
		}

		// Database mode - use actual database functions
		const { deleteTalent } = await import('$lib/server/services/talents');

		try {
			await deleteTalent(id);
			return { success: 'Talent deleted successfully' };
		} catch (error) {
			logger.error({ err: error }, 'Error deleting talent');
			return fail(500, { error: 'Failed to delete talent' });
		}
	}
};

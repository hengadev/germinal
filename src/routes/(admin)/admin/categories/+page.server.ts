import type { PageServerLoad } from './$types';
import { logger } from '$lib/server/logger';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_CATEGORIES } from '$lib/mock-data';

export const load: PageServerLoad = async () => {
	if (env.USE_MOCK_DATA) {
		// Mock mode - return all categories
		return {
			categories: MOCK_CATEGORIES
		};
	}

	// Database mode - import and use actual database functions
	const { getAllCategories } = await import('$lib/server/services/categories');
	const categories = await getAllCategories();

	return {
		categories
	};
};

export const actions: Actions = {
	/**
	 * Create a new category
	 */
	createCategory: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name');
		const displayName = formData.get('displayName');
		const slug = formData.get('slug');
		const description = formData.get('description');
		const icon = formData.get('icon');
		const color = formData.get('color');
		const sortOrder = formData.get('sortOrder');
		const published = formData.get('published') === 'true';

		// Validation
		if (!name || typeof name !== 'string') {
			return fail(400, { error: 'Name is required' });
		}

		if (!displayName || typeof displayName !== 'string') {
			return fail(400, { error: 'Display name is required' });
		}

		if (!slug || typeof slug !== 'string') {
			return fail(400, { error: 'Slug is required' });
		}

		// Validate slug format
		if (!/^[a-z0-9-]+$/.test(slug)) {
			return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - add to mock data array (not persisted)
			const newCategory = {
				id: String(MOCK_CATEGORIES.length + 1),
				name,
				displayName,
				slug,
				description: description || null,
				icon: icon || null,
				color: color || null,
				sortOrder: sortOrder ? parseInt(sortOrder) : 0,
				published,
				createdAt: new Date(),
				updatedAt: new Date(),
				eventCount: 0
			};

			MOCK_CATEGORIES.push(newCategory);

			return { success: `Category "${displayName}" created successfully` };
		}

		// Database mode - use actual database functions
		const { createCategory } = await import('$lib/server/services/categories');

		try {
			await createCategory({
				name,
				displayName,
				slug,
				description: description || null,
				icon: icon || null,
				color: color || null,
				sortOrder: sortOrder ? parseInt(sortOrder) : 0,
				published
			});

			return { success: `Category "${displayName}" created successfully` };
		} catch (error) {
			logger.error('Error creating category:', error);
			return fail(500, { error: 'Failed to create category. The slug may already be in use.' });
		}
	},

	/**
	 * Update an existing category
	 */
	updateCategory: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');
		const name = formData.get('name');
		const displayName = formData.get('displayName');
		const slug = formData.get('slug');
		const description = formData.get('description');
		const icon = formData.get('icon');
		const color = formData.get('color');
		const sortOrder = formData.get('sortOrder');
		const published = formData.get('published') === 'true';

		// Validate id
		if (!id || typeof id !== 'string') {
			return fail(400, { error: 'Category ID is required' });
		}

		// Validation
		if (!name || typeof name !== 'string') {
			return fail(400, { error: 'Name is required' });
		}

		if (!displayName || typeof displayName !== 'string') {
			return fail(400, { error: 'Display name is required' });
		}

		if (!slug || typeof slug !== 'string') {
			return fail(400, { error: 'Slug is required' });
		}

		// Validate slug format
		if (!/^[a-z0-9-]+$/.test(slug)) {
			return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - update in mock data array (not persisted)
			const categoryIndex = MOCK_CATEGORIES.findIndex((c) => c.id === id);

			if (categoryIndex === -1) {
				return fail(404, { error: 'Category not found' });
			}

			MOCK_CATEGORIES[categoryIndex] = {
				...MOCK_CATEGORIES[categoryIndex],
				name,
				displayName,
				slug,
				description: description || null,
				icon: icon || null,
				color: color || null,
				sortOrder: sortOrder ? parseInt(sortOrder) : 0,
				published,
				updatedAt: new Date()
			};

			return { success: `Category "${displayName}" updated successfully` };
		}

		// Database mode - use actual database functions
		const { updateCategory } = await import('$lib/server/services/categories');

		try {
			await updateCategory(id, {
				name,
				displayName,
				slug,
				description: description || null,
				icon: icon || null,
				color: color || null,
				sortOrder: sortOrder ? parseInt(sortOrder) : 0,
				published
			});

			return { success: `Category "${displayName}" updated successfully` };
		} catch (error) {
			logger.error('Error updating category:', error);
			return fail(500, { error: 'Failed to update category' });
		}
	},

	/**
	 * Delete a category
	 */
	deleteCategory: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id');

		if (!id || typeof id !== 'string') {
			return fail(400, { error: 'Category ID is required' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - remove from mock data array (not persisted)
			const categoryIndex = MOCK_CATEGORIES.findIndex((c) => c.id === id);

			if (categoryIndex === -1) {
				return fail(404, { error: 'Category not found' });
			}

			const category = MOCK_CATEGORIES[categoryIndex];

			// Check if category has events
			if (category.eventCount > 0) {
				return fail(400, { error: 'Cannot delete category with associated events' });
			}

			MOCK_CATEGORIES.splice(categoryIndex, 1);

			return { success: `Category "${category.displayName}" deleted successfully` };
		}

		// Database mode - use actual database functions
		const { deleteCategory } = await import('$lib/server/services/categories');

		try {
			await deleteCategory(id);
			return { success: 'Category deleted successfully' };
		} catch (error) {
			logger.error('Error deleting category:', error);
			if (error instanceof Error && error.message.includes('Cannot delete category with associated events')) {
				return fail(400, { error: error.message });
			}
			return fail(500, { error: 'Failed to delete category' });
		}
	}
};

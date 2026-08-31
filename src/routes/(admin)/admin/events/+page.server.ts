import type { PageServerLoad } from './$types';
import { logger } from '$lib/server/logger';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { requireAdmin } from '$lib/server/auth-guards';
import { MOCK_EVENTS, MOCK_CATEGORIES } from '$lib/mock-data';
import type { EventWithMedia } from '$lib/types/events';

export const load: PageServerLoad = async ({ url }) => {
    // Get search query from URL
    const searchQuery = url.searchParams.get('q') || undefined;

    if (env.USE_MOCK_DATA) {
        // Mock mode - return all events (published and unpublished)
        let filteredEvents = MOCK_EVENTS;

        // Apply search filter if provided
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredEvents = MOCK_EVENTS.filter(e =>
                e.titleEn.toLowerCase().includes(query) ||
                e.titleFr.toLowerCase().includes(query)
            );
        }

        return {
            events: filteredEvents as unknown as EventWithMedia[],
            categories: MOCK_CATEGORIES,
            searchQuery,
        };
    }

    // Database mode - import and use actual database functions
    const { getAllEvents } = await import('$lib/server/services/events');
    const { getAllCategories } = await import('$lib/server/services/categories');
    const [result, categories] = await Promise.all([
        getAllEvents({ publishedOnly: false, search: searchQuery }),
        getAllCategories({ publishedOnly: false })
    ]);

    return {
        events: result.data as EventWithMedia[],
        categories,
        searchQuery,
    };
};

export const actions: Actions = {
    /**
     * Create a new event category
     */
    createCategory: async ({ request, locals }) => {
        requireAdmin(locals);
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
                id: String(MOCK_CATEGORIES.length + 1),
                name,
                displayNameEn,
                displayNameFr,
                slug,
                description: description?.toString() || '',
                icon: icon?.toString() || '',
                color: color?.toString() || '',
                sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
                published,
                createdAt: new Date(),
                updatedAt: new Date(),
                eventCount: 0
            };
            MOCK_CATEGORIES.push(newCategory as typeof MOCK_CATEGORIES[number]);
            return { success: `Category "${displayNameEn}" created successfully` };
        }

        const { createCategory } = await import('$lib/server/services/categories');
        try {
            await createCategory({
                name,
                displayNameEn,
                displayNameFr,
                slug,
                description: description?.toString() || null,
                icon: icon?.toString() || null,
                color: color?.toString() || null,
                sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
                published
            });
            return { success: `Category "${displayNameEn}" created successfully` };
        } catch (error) {
            logger.error({ err: error }, 'Error creating category');
            return fail(500, { error: 'Failed to create category. The slug may already be in use.' });
        }
    },

    /**
     * Update an existing event category
     */
    updateCategory: async ({ request, locals }) => {
        requireAdmin(locals);
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
            const idx = MOCK_CATEGORIES.findIndex((c) => c.id === id);
            if (idx === -1) return fail(404, { error: 'Category not found' });
            MOCK_CATEGORIES[idx] = {
                ...MOCK_CATEGORIES[idx],
                name,
                displayNameEn,
                displayNameFr,
                slug,
                description: description?.toString() || null,
                icon: icon?.toString() || null,
                color: color?.toString() || null,
                sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
                published,
                updatedAt: new Date()
            } as typeof MOCK_CATEGORIES[number];
            return { success: `Category "${displayNameEn}" updated successfully` };
        }

        const { updateCategory } = await import('$lib/server/services/categories');
        try {
            await updateCategory(id, {
                name,
                displayNameEn,
                displayNameFr,
                slug,
                description: description?.toString() || null,
                icon: icon?.toString() || null,
                color: color?.toString() || null,
                sortOrder: sortOrder ? parseInt(sortOrder.toString()) : 0,
                published
            });
            return { success: `Category "${displayNameEn}" updated successfully` };
        } catch (error) {
            logger.error({ err: error }, 'Error updating category');
            return fail(500, { error: 'Failed to update category' });
        }
    },

    /**
     * Delete an event category
     */
    deleteCategory: async ({ request, locals }) => {
        requireAdmin(locals);
        const formData = await request.formData();
        const id = formData.get('id');

        if (!id || typeof id !== 'string') return fail(400, { error: 'Category ID is required' });

        if (env.USE_MOCK_DATA) {
            const idx = MOCK_CATEGORIES.findIndex((c) => c.id === id);
            if (idx === -1) return fail(404, { error: 'Category not found' });
            const category = MOCK_CATEGORIES[idx];
            if (category.eventCount > 0) return fail(400, { error: 'Cannot delete category with associated events' });
            MOCK_CATEGORIES.splice(idx, 1);
            return { success: `Category "${category.displayNameEn}" deleted successfully` };
        }

        const { deleteCategory } = await import('$lib/server/services/categories');
        try {
            await deleteCategory(id);
            return { success: 'Category deleted successfully' };
        } catch (error) {
            logger.error({ err: error }, 'Error deleting category');
            if (error instanceof Error && error.message.includes('Cannot delete category with associated events')) {
                return fail(400, { error: error.message });
            }
            return fail(500, { error: 'Failed to delete category' });
        }
    },

    /**
     * Delete an event
     */
    deleteEvent: async ({ request, locals }) => {
        requireAdmin(locals);
        const formData = await request.formData();
        const id = formData.get('id');

        if (!id || typeof id !== 'string') {
            return fail(400, { error: 'Event ID is required' });
        }

        if (env.USE_MOCK_DATA) {
            // Mock mode - remove from mock data array (not persisted)
            const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);

            if (eventIndex === -1) {
                return fail(404, { error: 'Event not found' });
            }

            const event = MOCK_EVENTS[eventIndex];
            MOCK_EVENTS.splice(eventIndex, 1);

            return { success: `Event "${event.titleEn}" deleted successfully` };
        }

        // Database mode - use actual database functions
        const { deleteEvent } = await import('$lib/server/services/events');

        try {
            await deleteEvent(id);

            const { recordAuditLog } = await import('$lib/server/services/audit-log');
            await recordAuditLog({
                adminId: locals.user!.id,
                action: 'event.delete',
                entityType: 'event',
                entityId: id,
            });

            return { success: 'Event deleted successfully' };
        } catch (error) {
            logger.error({ err: error }, 'Error deleting event');
            return fail(500, { error: 'Failed to delete event' });
        }
    }
};

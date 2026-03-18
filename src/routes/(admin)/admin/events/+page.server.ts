import type { PageServerLoad } from './$types';
import { logger } from '$lib/server/logger';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_CATEGORIES } from '$lib/mock-data';
import type { EventWithMedia } from '$lib/types/events';

export const load: PageServerLoad = async () => {
    if (env.USE_MOCK_DATA) {
        // Mock mode - return all events (published and unpublished)
        return {
            events: MOCK_EVENTS as unknown as EventWithMedia[],
            categories: MOCK_CATEGORIES
        };
    }

    // Database mode - import and use actual database functions
    const { getAllEvents } = await import('$lib/server/services/events');
    const { getAllCategories } = await import('$lib/server/services/categories');
    const [result, categories] = await Promise.all([
        getAllEvents({ publishedOnly: false }),
        getAllCategories({ publishedOnly: false })
    ]);

    return {
        events: result.data as EventWithMedia[],
        categories
    };
};

export const actions: Actions = {
    /**
     * Update an existing event
     */
    updateEvent: async ({ request }) => {
        const formData = await request.formData();
        const id = formData.get('id');
        const titleEnRaw = formData.get('titleEn') ?? formData.get('title');
        const titleEn = typeof titleEnRaw === 'string' ? titleEnRaw : null;
        const titleFrRaw = formData.get('titleFr') ?? titleEn;
        const titleFr = typeof titleFrRaw === 'string' ? titleFrRaw : null;
        const slug = formData.get('slug');
        const descriptionEnRaw = formData.get('descriptionEn') ?? formData.get('description');
        const descriptionEn = typeof descriptionEnRaw === 'string' ? descriptionEnRaw : null;
        const descriptionFrRaw = formData.get('descriptionFr') ?? descriptionEn;
        const descriptionFr = typeof descriptionFrRaw === 'string' ? descriptionFrRaw : null;
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const location = formData.get('location');
        const categoryId = formData.get('categoryId');
        const published = formData.get('published') === 'true';
        const coverMediaId = formData.get('coverMediaId')?.toString() || null;
        const isSpotlight = formData.get('isSpotlight') === 'true';

        // Validate id
        if (!id || typeof id !== 'string') {
            return fail(400, { error: 'Event ID is required' });
        }

        // Validation
        if (!titleEn || typeof titleEn !== 'string') {
            return fail(400, { error: 'Title is required' });
        }

        if (!titleFr || typeof titleFr !== 'string') {
            return fail(400, { error: 'Title is required' });
        }

        if (!slug || typeof slug !== 'string') {
            return fail(400, { error: 'Slug is required' });
        }

        if (!descriptionEn || typeof descriptionEn !== 'string') {
            return fail(400, { error: 'Description is required' });
        }

        if (!descriptionFr || typeof descriptionFr !== 'string') {
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
            // Mock mode - update in mock data array (not persisted)
            const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);

            if (eventIndex === -1) {
                return fail(404, { error: 'Event not found' });
            }

            MOCK_EVENTS[eventIndex] = {
                ...MOCK_EVENTS[eventIndex],
                titleEn,
                titleFr,
                slug,
                descriptionEn,
                descriptionFr,
                startDate: start,
                endDate: end,
                location,
                coverMediaId: coverMediaId || MOCK_EVENTS[eventIndex].coverMediaId,
                published,
                isSpotlight,
                updatedAt: new Date()
            } as typeof MOCK_EVENTS[number];

            return { success: `Event "${titleEn}" updated successfully` };
        }

        // Database mode - use actual database functions
        const { updateEvent } = await import('$lib/server/services/events');

        try {
            await updateEvent(id, {
                titleEn,
                titleFr,
                slug,
                descriptionEn,
                descriptionFr,
                startDate: start,
                endDate: end,
                location,
                categoryId: categoryId?.toString() || null,
                coverMediaId: coverMediaId || null,
                published,
                isSpotlight
            });

            // Link the cover media record to this event
            if (coverMediaId) {
                const { db } = await import('$lib/server/db');
                const { media: mediaTable } = await import('$lib/server/db/schema');
                const { eq } = await import('drizzle-orm');
                await db.update(mediaTable)
                    .set({ isCover: false })
                    .where(eq(mediaTable.eventId, id));
                await db.update(mediaTable)
                    .set({ eventId: id, isCover: true })
                    .where(eq(mediaTable.id, coverMediaId));
            }

            return { success: `Event "${titleEn}" updated successfully` };
        } catch (error) {
            logger.error({ err: error }, 'Error updating event');
            return fail(500, { error: 'Failed to update event' });
        }
    },

    /**
     * Create a new event category
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
    deleteCategory: async ({ request }) => {
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
    deleteEvent: async ({ request }) => {
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
            return { success: 'Event deleted successfully' };
        } catch (error) {
            logger.error({ err: error }, 'Error deleting event');
            return fail(500, { error: 'Failed to delete event' });
        }
    }
};

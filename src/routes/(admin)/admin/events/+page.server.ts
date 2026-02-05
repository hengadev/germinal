import type { PageServerLoad } from './$types';
import { logger } from '$lib/server/logger';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS } from '$lib/mock-data';
import type { EventWithMedia } from '$lib/types/events';

export const load: PageServerLoad = async () => {
    if (env.USE_MOCK_DATA) {
        // Mock mode - return all events (published and unpublished)
        return {
            events: MOCK_EVENTS as unknown as EventWithMedia[]
        };
    }

    // Database mode - import and use actual database functions
    const { getAllEvents } = await import('$lib/server/services/events');
    const result = await getAllEvents({ publishedOnly: false });

    return {
        events: result.data as EventWithMedia[]
    };
};

export const actions: Actions = {
    /**
     * Create a new event
     */
    createEvent: async ({ request }) => {
        const formData = await request.formData();
        const titleEn = formData.get('titleEn');
        const titleFr = formData.get('titleFr');
        const slug = formData.get('slug');
        const descriptionEn = formData.get('descriptionEn');
        const descriptionFr = formData.get('descriptionFr');
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const location = formData.get('location');
        const published = formData.get('published') === 'true';

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
            const newEvent = {
                id: String(MOCK_EVENTS.length + 1),
                titleEn,
                titleFr,
                slug,
                descriptionEn,
                descriptionFr,
                subtitleEn: '',
                subtitleFr: '',
                startDate: start,
                endDate: end,
                location,
                venueName: null,
                streetAddress: null,
                district: null,
                city: null,
                postalCode: null,
                country: null,
                collaborators: null,
                timings: null,
                curatorEn: null,
                curatorFr: null,
                materialsEn: null,
                materialsFr: null,
                admissionInfoEn: null,
                admissionInfoFr: null,
                published,
                isSpotlight: false,
                categoryId: null,
                category: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                coverMediaId: null,
                coverMedia: null,
                media: []
            } as unknown as typeof MOCK_EVENTS[number];

            MOCK_EVENTS.push(newEvent);

            return { success: `Event "${titleEn}" created successfully` };
        }

        // Database mode - use actual database functions
        const { createEvent } = await import('$lib/server/services/events');

        try {
            await createEvent({
                titleEn,
                titleFr,
                slug,
                descriptionEn,
                descriptionFr,
                subtitleEn: null,
                subtitleFr: null,
                startDate: start,
                endDate: end,
                location,
                venueName: null,
                streetAddress: null,
                district: null,
                city: null,
                postalCode: null,
                country: null,
                collaborators: null,
                timings: null,
                curatorEn: null,
                curatorFr: null,
                materialsEn: null,
                materialsFr: null,
                admissionInfoEn: null,
                admissionInfoFr: null,
                coverMediaId: null,
                categoryId: null,
                published,
                isSpotlight: false
            });

            return { success: `Event "${titleEn}" created successfully` };
        } catch (error) {
            logger.error({ err: error }, 'Error creating event');
            return fail(500, { error: 'Failed to create event. The slug may already be in use.' });
        }
    },

    /**
     * Update an existing event
     */
    updateEvent: async ({ request }) => {
        const formData = await request.formData();
        const id = formData.get('id');
        const titleEn = formData.get('titleEn');
        const titleFr = formData.get('titleFr');
        const slug = formData.get('slug');
        const descriptionEn = formData.get('descriptionEn');
        const descriptionFr = formData.get('descriptionFr');
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const location = formData.get('location');
        const published = formData.get('published') === 'true';

        // Validate id
        if (!id || typeof id !== 'string') {
            return fail(400, { error: 'Event ID is required' });
        }

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
                published,
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
                published
            });

            return { success: `Event "${titleEn}" updated successfully` };
        } catch (error) {
            logger.error({ err: error }, 'Error updating event');
            return fail(500, { error: 'Failed to update event' });
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

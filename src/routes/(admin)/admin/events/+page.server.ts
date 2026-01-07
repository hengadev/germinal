import type { PageServerLoad } from './$types';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { MOCK_EVENTS } from '$lib/mock-data';

export const load: PageServerLoad = async () => {
    if (env.USE_MOCK_DATA) {
        // Mock mode - return all events (published and unpublished)
        return {
            events: MOCK_EVENTS
        };
    }

    // Database mode - import and use actual database functions
    const { getAllEvents } = await import('$lib/server/services/events');
    const events = await getAllEvents(false); // false = get all, not just published

    return {
        events
    };
};

export const actions: Actions = {
    /**
     * Create a new event
     */
    createEvent: async ({ request }) => {
        const formData = await request.formData();
        const title = formData.get('title');
        const slug = formData.get('slug');
        const description = formData.get('description');
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const location = formData.get('location');
        const published = formData.get('published') === 'true';

        // Validation
        if (!title || typeof title !== 'string') {
            return fail(400, { error: 'Title is required' });
        }

        if (!slug || typeof slug !== 'string') {
            return fail(400, { error: 'Slug is required' });
        }

        if (!description || typeof description !== 'string') {
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
            // Mock mode - add to mock data array (not persisted)
            const newEvent = {
                id: String(MOCK_EVENTS.length + 1),
                title,
                slug,
                description,
                startDate: start,
                endDate: end,
                location,
                published,
                createdAt: new Date(),
                updatedAt: new Date(),
                coverMediaId: null,
                coverMedia: null,
                media: []
            } as typeof MOCK_EVENTS[number];

            MOCK_EVENTS.push(newEvent);

            return { success: `Event "${title}" created successfully` };
        }

        // Database mode - use actual database functions
        const { createEvent } = await import('$lib/server/services/events');

        try {
            await createEvent({
                title,
                slug,
                description,
                startDate: start,
                endDate: end,
                location,
                coverMediaId: null,
                published
            });

            return { success: `Event "${title}" created successfully` };
        } catch (error) {
            console.error('Error creating event:', error);
            return fail(500, { error: 'Failed to create event. The slug may already be in use.' });
        }
    },

    /**
     * Update an existing event
     */
    updateEvent: async ({ request }) => {
        const formData = await request.formData();
        const id = formData.get('id');
        const title = formData.get('title');
        const slug = formData.get('slug');
        const description = formData.get('description');
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const location = formData.get('location');
        const published = formData.get('published') === 'true';

        // Validate id
        if (!id || typeof id !== 'string') {
            return fail(400, { error: 'Event ID is required' });
        }

        // Validation
        if (!title || typeof title !== 'string') {
            return fail(400, { error: 'Title is required' });
        }

        if (!slug || typeof slug !== 'string') {
            return fail(400, { error: 'Slug is required' });
        }

        if (!description || typeof description !== 'string') {
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
                title,
                slug,
                description,
                startDate: start,
                endDate: end,
                location,
                published,
                updatedAt: new Date()
            };

            return { success: `Event "${title}" updated successfully` };
        }

        // Database mode - use actual database functions
        const { updateEvent } = await import('$lib/server/services/events');

        try {
            await updateEvent(id, {
                title,
                slug,
                description,
                startDate: start,
                endDate: end,
                location,
                published
            });

            return { success: `Event "${title}" updated successfully` };
        } catch (error) {
            console.error('Error updating event:', error);
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

            return { success: `Event "${event.title}" deleted successfully` };
        }

        // Database mode - use actual database functions
        const { deleteEvent } = await import('$lib/server/services/events');

        try {
            await deleteEvent(id);
            return { success: 'Event deleted successfully' };
        } catch (error) {
            console.error('Error deleting event:', error);
            return fail(500, { error: 'Failed to delete event' });
        }
    }
};

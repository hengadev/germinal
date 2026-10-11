import type { PageServerLoad } from './$types';
import { logger } from '$lib/server/logger';
import type { Actions } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { requireAdmin } from '$lib/server/auth-guards';
import { MOCK_EVENTS } from '$lib/mock-data';
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
            searchQuery,
        };
    }

    // Database mode - import and use actual database functions
    const { getAllEvents } = await import('$lib/server/services/events');
    const result = await getAllEvents({ publishedOnly: false, search: searchQuery });

    return {
        events: result.data as EventWithMedia[],
        searchQuery,
    };
};

export const actions: Actions = {
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

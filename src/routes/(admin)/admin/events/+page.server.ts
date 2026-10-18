import type { PageServerLoad } from './$types';
import { logger } from '$lib/server/logger';
import type { Actions } from '@sveltejs/kit';
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$lib/server/env';
import { requireAdmin } from '$lib/server/auth-guards';
import { MOCK_EVENTS } from '$lib/mock-data';
import type { EventWithMedia } from '$lib/types/events';
import type { ServiceKind } from '$lib/utils/event-time';
import { parsePickedDays, pickedDaysErrorMessage } from '$lib/server/services/event-schedule';
import { parseVisibility } from '$lib/utils/event-access';

/** The list's filter: one Visibility, the Portfolio, or every Event. */
export type EventListFilter = 'all' | 'draft' | 'private' | 'public' | 'portfolio';

function parseFilter(value: string | null): EventListFilter {
    if (value === 'portfolio') return 'portfolio';
    return parseVisibility(value) ?? 'all';
}

export const load: PageServerLoad = async ({ url }) => {
    // Get search query from URL
    const searchQuery = url.searchParams.get('q') || undefined;
    const filter = parseFilter(url.searchParams.get('filter'));

    if (env.USE_MOCK_DATA) {
        // Mock mode - return all events, whatever their Visibility
        let filteredEvents = MOCK_EVENTS.filter((e) =>
            filter === 'all' ? true : filter === 'portfolio' ? e.isPortfolio : e.visibility === filter
        );

        // Apply search filter if provided
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredEvents = filteredEvents.filter(e =>
                (e.titleEn ?? '').toLowerCase().includes(query) ||
                (e.titleFr ?? '').toLowerCase().includes(query)
            );
        }

        return {
            events: filteredEvents as unknown as EventWithMedia[],
            servedKinds: {} as Record<string, ServiceKind[]>,
            searchQuery,
            filter,
        };
    }

    // Database mode - import and use actual database functions
    const { getAllEvents } = await import('$lib/server/services/events');
    const { getServedKindsByEventIds } = await import('$lib/server/services/event-duplicate');
    // The list has no pagination: every Event shows, whatever the filter.
    const result = await getAllEvents({
        listedOnly: false,
        search: searchQuery,
        limit: 500,
        visibility: filter === 'all' || filter === 'portfolio' ? undefined : filter,
        portfolioOnly: filter === 'portfolio',
    });
    const eventsData = result.data as EventWithMedia[];

    return {
        events: eventsData,
        // The meals each Event serves: « Dupliquer » pre-ticks them (issue 046).
        servedKinds: await getServedKindsByEventIds(eventsData.map((event) => event.id)),
        searchQuery,
        filter,
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

            return { success: `Event "${event.titleEn ?? ''}" deleted successfully` };
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
    },

    /**
     * « Dupliquer » (issue 046): copy an Event onto the new Days picked in
     * the dialog, as a Draft, and open it. Posted from the Events list and
     * from the Event page.
     */
    duplicateEvent: async ({ request, locals }) => {
        requireAdmin(locals);
        const formData = await request.formData();
        const id = formData.get('id');
        if (!id || typeof id !== 'string') {
            return fail(400, { error: 'L’événement à dupliquer est requis.' });
        }

        const picked = parsePickedDays(formData.get('days')?.toString() ?? null);
        if (!picked.ok) {
            return fail(400, { error: pickedDaysErrorMessage(picked.reason) });
        }

        if (env.USE_MOCK_DATA) {
            return fail(400, { error: 'La duplication n’est pas disponible en mode démo.' });
        }

        const { duplicateEvent, DuplicateSourceMissingError } = await import('$lib/server/services/event-duplicate');
        let copyId: string;
        try {
            copyId = await duplicateEvent(id, picked.days);
        } catch (error) {
            if (error instanceof DuplicateSourceMissingError) {
                return fail(404, { error: error.message });
            }
            logger.error({ err: error, eventId: id }, 'Error duplicating event');
            return fail(500, { error: 'La duplication de l’événement a échoué.' });
        }

        const { recordAuditLog } = await import('$lib/server/services/audit-log');
        await recordAuditLog({
            adminId: locals.user!.id,
            action: 'event.duplicate',
            entityType: 'event',
            entityId: copyId,
            metadata: { sourceId: id },
        });

        throw redirect(303, `/admin/events/${copyId}`);
    }
};

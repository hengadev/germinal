import { getAllEvents, getUpcomingEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { isListed, isUpcoming } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';
import { withProjectCover } from '$lib/utils/event-photos';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';

// « Projets » is an index: every listed Event on one page.
const PROJECTS_LIMIT = 100;

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for events');
        // « À venir » (issue 072), by the same rule as the homepage's mock
        // branch. The mock Events carry no Seatings, so nothing is upcoming.
        const now = new Date();
        const nextPublishedStart = (e: (typeof MOCK_EVENTS)[number]): Date | null => {
            const sessions = ((e as Record<string, unknown>).eventSessions ?? (e as Record<string, unknown>).sessions ?? []) as { published?: boolean; startTime?: unknown }[];
            const starts = sessions
                .filter((s) => s.published && s.startTime)
                .map((s) => new Date(s.startTime as string | Date))
                .filter((d) => d.getTime() > now.getTime())
                .sort((a, b) => a.getTime() - b.getTime());
            return starts[0] ?? null;
        };
        const mockUpcoming = MOCK_EVENTS.filter((e) => isUpcoming(e, nextPublishedStart(e), now)) as unknown as EventWithMedia[];
        return {
            // ProjectIndex expects the upcoming group newest first.
            events: [...[...mockUpcoming].reverse(), ...MOCK_EVENTS.filter((e) => isListed(e) && !e.isSpotlight)
                .slice(0, PROJECTS_LIMIT)
                .map((e) => withProjectCover(withoutPracticalInfo(e))) as unknown as EventWithMedia[]],
        };
    }

    const [result, upcoming] = await Promise.all([
        getAllEvents({
            listedOnly: true,
            excludeSpotlight: true,
            page: 1,
            limit: PROJECTS_LIMIT,
        }),
        getUpcomingEvents(),
    ]);

    return {
        // Upcoming Events (Spotlight included, issue 072) above the Portfolio,
        // soonest first — ProjectIndex expects the upcoming group newest first.
        events: [...[...upcoming].reverse() as unknown as EventWithMedia[], ...(result.data as EventWithMedia[])],
    };
};

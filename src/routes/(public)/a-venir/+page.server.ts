import { getUpcomingEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { MOCK_EVENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { isUpcoming } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';

// « À venir » (issue 073): every upcoming Public Event on its own page,
// Spotlight included, soonest first — the same rows as the homepage.
export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for a-venir');
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
        return {
            events: MOCK_EVENTS.filter((e) => isUpcoming(e, nextPublishedStart(e), now)).map((e) => withoutPracticalInfo(e)) as unknown as EventWithMedia[],
        };
    }

    const upcoming = await getUpcomingEvents();
    return { events: upcoming as unknown as EventWithMedia[] };
};

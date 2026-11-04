import { getAllEvents, getSpotlightEvent, getUpcomingEvents } from '$lib/server/services/events';
import { logger } from '$lib/server/logger';
import { getAllTalents } from '$lib/server/services/talents';
import { MOCK_EVENTS, MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { canBeSpotlight, isListed, isUpcoming } from '$lib/utils/event-access';
import { withoutPracticalInfo } from '$lib/utils/practical-info';
import { withProjectCover } from '$lib/utils/event-photos';
import type { PageServerLoad } from './$types';
import type { EventWithMedia } from '$lib/types/events';
import type { TalentWithMedia } from '$lib/types/talents';

export const load: PageServerLoad = async () => {
    // Use mock data if enabled (no database required!)
    if (USE_MOCK_DATA) {
        logger.info('📦 Using mock data for events');
        const mockSpotlight = MOCK_EVENTS.find(e => e.isSpotlight && canBeSpotlight(e)) ?? null;
        // « À venir » (issue 071), by the same rule as the database path.
        // The mock Events carry no Seatings, so nothing is upcoming.
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
            // The gallery draws from the Portfolio (issue 044); the upcoming
            // event is the Spotlight, which the Portfolio never holds.
            // Neither carries Practical Info (issue 040).
            events: MOCK_EVENTS.filter(isListed).map((e) => withProjectCover(withoutPracticalInfo(e))) as unknown as EventWithMedia[],
            spotlightEvent: (mockSpotlight ? withoutPracticalInfo(mockSpotlight) : null) as unknown as EventWithMedia | null,
            talents: MOCK_TALENTS as unknown as TalentWithMedia[],
            heroImage: null,
            heroVideo: null,
            upcoming: MOCK_EVENTS.filter((e) => isUpcoming(e, nextPublishedStart(e), now)).map((e) => withoutPracticalInfo(e)) as unknown as EventWithMedia[],
        };
    }

    const { getSiteSettings } = await import('$lib/server/services/site-settings');

    const [eventsResult, talentsResult, siteSettings, spotlightEvent, upcoming] = await Promise.all([
        getAllEvents({ listedOnly: true }),
        getAllTalents({ publishedOnly: true }),
        getSiteSettings(),
        getSpotlightEvent(),
        getUpcomingEvents(),
    ]);

    return {
        events: eventsResult.data as EventWithMedia[],
        talents: talentsResult.data as TalentWithMedia[],
        heroImage: siteSettings?.heroImage ?? null,
        heroVideo: siteSettings?.heroVideo ?? null,
        // The public Spotlight has no Practical Info (issue 040); the cards
        // read it like the mock branch's Events do.
        spotlightEvent: spotlightEvent as EventWithMedia | null,
        // « À venir » (issue 071): without Practical Info, soonest first.
        upcoming: upcoming as unknown as EventWithMedia[],
    };
};

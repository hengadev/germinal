import { db } from '$lib/server/db';
import { toAccessEvent } from '$lib/server/services/event-access';
import { isIndexed, type Visibility } from '$lib/utils/event-access';
import { MOCK_EVENTS, MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';
import { eq } from 'drizzle-orm';
import { talents } from '$lib/server/db/schema';
import { getSpotlightEvent, hasUpcomingEvents } from '$lib/server/services/events';
import { hasPublishedTalents } from '$lib/server/services/talents';

const SITE_URL = 'https://germinalstudio.co';

interface SitemapEntry {
	url: string;
	lastmod?: string;
	changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
	priority?: number;
}

function generateSitemap(entries: SitemapEntry[]): string {
	const urls = entries
		.map(
			(entry) => `  <url>
    <loc>${entry.url}</loc>
${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ''}${
				entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>\n` : ''
			}${entry.priority !== undefined ? `    <priority>${entry.priority}</priority>\n` : ''}  </url>`
		)
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export async function GET() {
	const entries: SitemapEntry[] = [];

	// Static pages. « À venir », « Talents » and the Spotlight are listed
	// only while the navigation links them: empty, they have nothing to index.
	let upcoming = false;
	let talentsPublished = USE_MOCK_DATA && MOCK_TALENTS.length > 0;
	let spotlight = false;
	if (!USE_MOCK_DATA) {
		try {
			[upcoming, talentsPublished, spotlight] = await Promise.all([
				hasUpcomingEvents(),
				hasPublishedTalents(),
				getSpotlightEvent().then((event) => event !== null),
			]);
		} catch (error) {
			console.error('Error fetching sitemap pages:', error);
		}
	}
	entries.push(
		{ url: `${SITE_URL}/`, changefreq: 'weekly', priority: 1.0 },
		{ url: `${SITE_URL}/events`, changefreq: 'daily', priority: 0.9 },
		...(upcoming ? [{ url: `${SITE_URL}/a-venir`, changefreq: 'daily' as const, priority: 0.9 }] : []),
		...(talentsPublished ? [{ url: `${SITE_URL}/talents`, changefreq: 'weekly' as const, priority: 0.8 }] : []),
		{ url: `${SITE_URL}/manifesto`, changefreq: 'monthly', priority: 0.7 },
		...(spotlight ? [{ url: `${SITE_URL}/spotlight`, changefreq: 'daily' as const, priority: 0.9 }] : []),
		{ url: `${SITE_URL}/contact`, changefreq: 'monthly', priority: 0.6 }
	);

	// Dynamic event pages
	if (USE_MOCK_DATA) {
		for (const event of MOCK_EVENTS.filter(isIndexed)) {
			entries.push({
				url: `${SITE_URL}/events/${event.id}`,
				lastmod: event.updatedAt?.toISOString().split('T')[0],
				changefreq: 'weekly',
				priority: 0.8
			});
		}
	} else {
		try {
			const allEvents: { id: string; updatedAt: Date | null; visibility: Visibility }[] = await db.query.events.findMany({
				columns: { id: true, updatedAt: true, visibility: true }
			});

			// Only the Events Event access lets be indexed (issue 030).
			for (const event of allEvents.filter((e) => isIndexed(toAccessEvent(e)))) {
				entries.push({
					url: `${SITE_URL}/events/${event.id}`,
					lastmod: event.updatedAt?.toISOString().split('T')[0],
					changefreq: 'weekly',
					priority: 0.8
				});
			}
		} catch (error) {
			console.error('Error fetching events for sitemap:', error);
		}
	}

	// Dynamic talent pages
	if (USE_MOCK_DATA) {
		for (const talent of MOCK_TALENTS) {
			entries.push({
				url: `${SITE_URL}/talents/${talent.id}`,
				changefreq: 'monthly',
				priority: 0.7
			});
		}
	} else {
		try {
			// An unpublished Talent's page answers 404 (issue 025).
			const allTalents = await db.query.talents.findMany({
				where: eq(talents.published, true),
				columns: { id: true }
			});

			for (const talent of allTalents) {
				entries.push({
					url: `${SITE_URL}/talents/${talent.id}`,
					changefreq: 'monthly',
					priority: 0.7
				});
			}
		} catch (error) {
			console.error('Error fetching talents for sitemap:', error);
		}
	}

	const sitemap = generateSitemap(entries);

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600'
		}
	});
}

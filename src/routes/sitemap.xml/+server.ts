import { db } from '$lib/server/db';
import { events, talents } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { MOCK_EVENTS, MOCK_TALENTS, USE_MOCK_DATA } from '$lib/mock-data';

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

	// Static pages
	entries.push(
		{ url: `${SITE_URL}/`, changefreq: 'weekly', priority: 1.0 },
		{ url: `${SITE_URL}/events`, changefreq: 'daily', priority: 0.9 },
		{ url: `${SITE_URL}/talents`, changefreq: 'weekly', priority: 0.8 },
		{ url: `${SITE_URL}/manifesto`, changefreq: 'monthly', priority: 0.7 },
		{ url: `${SITE_URL}/spotlight`, changefreq: 'daily', priority: 0.9 },
		{ url: `${SITE_URL}/contact`, changefreq: 'monthly', priority: 0.6 }
	);

	// Dynamic event pages
	if (USE_MOCK_DATA) {
		for (const event of MOCK_EVENTS) {
			entries.push({
				url: `${SITE_URL}/events/${event.slug}`,
				lastmod: event.updatedAt?.toISOString().split('T')[0],
				changefreq: 'weekly',
				priority: 0.8
			});
		}
	} else {
		try {
			const allEvents = await db.query.events.findMany({
				columns: { slug: true, updatedAt: true },
				where: eq(events.published, true)
			});

			for (const event of allEvents) {
				entries.push({
					url: `${SITE_URL}/events/${event.slug}`,
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
			const allTalents = await db.query.talents.findMany({
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

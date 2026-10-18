// @vitest-environment node
/**
 * The admin Events list filter: every Event, one Visibility, or the
 * Portfolio — so an Admin can see only the Drafts.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events } from '../../src/lib/server/db/schema';
import { getTestDatabase, setupTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: { DATABASE_URL: TEST_DATABASE_URL, USE_MOCK_DATA: false, PUBLIC_URL: 'http://localhost:5173' },
	config: { reservations: { maxTicketsPerReservation: 10 } },
	isStripeEnabled: () => false,
	isAWSConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

afterAll(async () => {
	await closeTestDatabase();
});

async function seedEvent(title: string, visibility: 'draft' | 'private' | 'public', isPortfolio = false) {
	await testDb.insert(events).values({ titleFr: title, visibility, isPortfolio });
}

async function titlesFor(url: string) {
	const { load } = await import('../../src/routes/(admin)/admin/events/+page.server');
	const data = (await load({ url: new URL(url, 'http://localhost') } as never)) as {
		events: { titleFr: string | null }[];
		filter: string;
	};
	return { filter: data.filter, titles: data.events.map((e) => e.titleFr).sort() };
}

describe('admin Events list filter', () => {
	beforeEach(async () => {
		await setupTestDatabase();
		await seedEvent('Brouillon', 'draft');
		await seedEvent('Privé', 'private', true);
		await seedEvent('Public', 'public');
	});

	it('lists every Event without a filter', async () => {
		expect(await titlesFor('/admin/events')).toEqual({ filter: 'all', titles: ['Brouillon', 'Privé', 'Public'] });
	});

	it('lists only the Drafts', async () => {
		expect(await titlesFor('/admin/events?filter=draft')).toEqual({ filter: 'draft', titles: ['Brouillon'] });
	});

	it('lists only the Portfolio Events, whatever their Visibility', async () => {
		expect(await titlesFor('/admin/events?filter=portfolio')).toEqual({ filter: 'portfolio', titles: ['Privé'] });
	});

	it('treats an unknown filter as every Event', async () => {
		expect((await titlesFor('/admin/events?filter=nope')).filter).toBe('all');
	});
});

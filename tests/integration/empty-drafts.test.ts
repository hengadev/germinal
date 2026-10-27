// @vitest-environment node
/**
 * Empty Drafts are cleaned up (issue 015, ADR 0010): leaving the editor of
 * an empty Draft deletes it, and a sweep job takes those not updated for
 * 24 hours — both through the same server check, which never deletes a
 * Draft with anything filled in, nor a published Event.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventDays, eventMenus, eventServices, media } from '../../src/lib/server/db/schema';
import { getTestDatabase, setupTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: { DATABASE_URL: TEST_DATABASE_URL, USE_MOCK_DATA: false, PUBLIC_URL: 'http://localhost:5173' },
	config: { reservations: { maxTicketsPerReservation: 10 } },
	isStripeEnabled: () => false,
	isAWSConfigured: () => false,
	isBrevoConfigured: () => false,
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

/** The modules under test, loaded once the database mock is in place. */
async function loadServices() {
	const { deleteEmptyDraft } = await import('../../src/lib/server/services/event-draft');
	const { cleanupEmptyDrafts } = await import('../../src/lib/server/jobs/cleanup-empty-drafts');
	return { deleteEmptyDraft, cleanupEmptyDrafts };
}

/** The empty Draft « Nouvel événement » creates: the schema's defaults. */
async function seedEmptyDraft(overrides: Partial<typeof events.$inferInsert> = {}) {
	const [event] = await testDb
		.insert(events)
		.values({ visibility: 'draft', ...overrides })
		.returning();
	return event;
}

/** Whether the Event still exists. */
async function exists(eventId: string) {
	const [row] = await testDb.select({ id: events.id }).from(events).where(eq(events.id, eventId));
	return Boolean(row);
}

describe('deleteEmptyDraft (the editor leave endpoint)', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('deletes the empty Draft « Nouvel événement » creates', async () => {
		const { deleteEmptyDraft } = await loadServices();
		const draft = await seedEmptyDraft();
		expect(await deleteEmptyDraft(draft.id)).toBe(true);
		expect(await exists(draft.id)).toBe(false);
	});

	it.each([
		['a French title', { titleFr: 'Une soirée au salon' }],
		['Internal Notes', { internalNotes: 'Client : Maison Lenoir' }],
		['a Time Zone other than the default one', { timeZone: 'Europe/London' }],
	])('keeps a Draft with %s', async (_what, overrides) => {
		const { deleteEmptyDraft } = await loadServices();
		const draft = await seedEmptyDraft(overrides);
		expect(await deleteEmptyDraft(draft.id)).toBe(false);
		expect(await exists(draft.id)).toBe(true);
	});

	it.each([
		['a Day', async (eventId: string) => {
			await testDb.insert(eventDays).values({ eventId, date: '2027-05-10' });
		}],
		['a Menu', async (eventId: string) => {
			await testDb.insert(eventMenus).values({ eventId, nameEn: 'Spring', nameFr: 'Printemps' });
		}],
		['a Visual', async (eventId: string) => {
			await testDb.insert(media).values({
				type: 'image',
				url: 'https://x/v.jpg',
				s3Key: 'v',
				mimeType: 'image/jpeg',
				size: 1,
				eventId,
				role: 'visual',
			});
		}],
		['an Event Photo', async (eventId: string) => {
			await testDb.insert(media).values({
				type: 'image',
				url: 'https://x/p.jpg',
				s3Key: 'p',
				mimeType: 'image/jpeg',
				size: 1,
				eventId,
				role: 'event_photo',
			});
		}],
	])('keeps a Draft with %s', async (_what, seed) => {
		const { deleteEmptyDraft } = await loadServices();
		const draft = await seedEmptyDraft();
		await seed(draft.id);
		expect(await deleteEmptyDraft(draft.id)).toBe(false);
		expect(await exists(draft.id)).toBe(true);
	});

	it('keeps a Draft with a priced Service, and a published Event however empty', async () => {
		const { deleteEmptyDraft } = await loadServices();
		const priced = await seedEmptyDraft();
		const [day] = await testDb
			.insert(eventDays)
			.values({ eventId: priced.id, date: '2027-05-10' })
			.returning();
		await testDb
			.insert(eventServices)
			.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 180, priceAmount: 9000 });
		expect(await deleteEmptyDraft(priced.id)).toBe(false);
		expect(await exists(priced.id)).toBe(true);

		const published = await seedEmptyDraft({ visibility: 'public' });
		expect(await deleteEmptyDraft(published.id)).toBe(false);
		expect(await exists(published.id)).toBe(true);
	});

	it('answers false for an unknown Event', async () => {
		const { deleteEmptyDraft } = await loadServices();
		expect(await deleteEmptyDraft('00000000-0000-4000-8000-000000000000')).toBe(false);
	});
});

describe('cleanupEmptyDrafts (the sweep job)', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	/** A Draft whose last update is `hoursAgo` old. */
	async function seedStaleDraft(hoursAgo: number, overrides: Partial<typeof events.$inferInsert> = {}) {
		const draft = await seedEmptyDraft(overrides);
		await testDb
			.update(events)
			.set({ updatedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) })
			.where(eq(events.id, draft.id));
		return draft;
	}

	it('deletes an empty Draft not updated for 24 hours', async () => {
		const stale = await seedStaleDraft(25);
		const fresh = await seedStaleDraft(1);

		const { cleanupEmptyDrafts } = await loadServices();
		const result = await cleanupEmptyDrafts(new Date());

		expect(result.deleted).toBe(1);
		expect(await exists(stale.id)).toBe(false);
		expect(await exists(fresh.id)).toBe(true);
	});

	it('keeps a Draft with anything filled in, and a published Event, however stale', async () => {
		const titled = await seedStaleDraft(25, { titleFr: 'Une soirée au salon' });
		const published = await seedStaleDraft(25);
		await testDb.update(events).set({ visibility: 'public' }).where(eq(events.id, published.id));

		const { cleanupEmptyDrafts } = await loadServices();
		const result = await cleanupEmptyDrafts(new Date());

		expect(result.deleted).toBe(0);
		expect(await exists(titled.id)).toBe(true);
		expect(await exists(published.id)).toBe(true);
	});
});

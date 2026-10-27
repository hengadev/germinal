// @vitest-environment node
/**
 * Draft completeness in the Events list (issue 013, ADR 0010): the load
 * computes each Draft's « n/8 » from the editor's warning rules, with the
 * Services and Seatings of the whole list batch-loaded; published Events
 * get nothing.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventDays, eventMenus, eventServices, eventSessions, media } from '../../src/lib/server/db/schema';
import { getTestDatabase, setupTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';
import { wallClockToInstant } from '../../src/lib/utils/event-time';
import type { EventCompleteness } from '../../src/lib/utils/event-warnings';

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

const ZONE = 'Europe/Paris';

async function loadCompleteness() {
	const { load } = await import('../../src/routes/(admin)/admin/events/+page.server');
	const data = (await load({ url: new URL('/admin/events', 'http://localhost') } as never)) as {
		completeness: Record<string, EventCompleteness>;
	};
	return data.completeness;
}

/** A Draft with only a French title: nothing else is filled in. */
async function seedBareDraft() {
	const [event] = await testDb
		.insert(events)
		.values({ visibility: 'draft', timeZone: ZONE, titleFr: 'Une soirée au salon' })
		.returning();
	return event;
}

/** A complete Draft: both languages, one priced dinner with its Menu, a
 * Seating and a Visual with its alt texts. */
async function seedCompleteDraft() {
	const [event] = await testDb
		.insert(events)
		.values({
			visibility: 'draft',
			timeZone: ZONE,
			titleEn: 'A Night at the Salon',
			titleFr: 'Une soirée au salon',
			descriptionEn: 'An intimate dinner.',
			descriptionFr: 'Un dîner intimiste.',
			locationEn: 'The Salon, Paris',
			locationFr: 'Le Salon, Paris',
		})
		.returning();
	const [visual] = await testDb
		.insert(media)
		.values({
			type: 'image',
			url: 'https://x/v.jpg',
			s3Key: 'v',
			mimeType: 'image/jpeg',
			size: 1,
			eventId: event.id,
			role: 'visual',
			isCover: true,
			altEn: 'A laid table',
			altFr: 'Une table dressée',
		})
		.returning();
	await testDb.update(events).set({ coverMediaId: visual.id }).where(eq(events.id, event.id));
	const [menu] = await testDb
		.insert(eventMenus)
		.values({ eventId: event.id, nameEn: 'Spring', nameFr: 'Printemps' })
		.returning();
	const [day] = await testDb.insert(eventDays).values({ eventId: event.id, date: '2027-03-12' }).returning();
	const [service] = await testDb
		.insert(eventServices)
		.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 180, menuId: menu.id, priceAmount: 9000 })
		.returning();
	await testDb.insert(eventSessions).values({
		eventId: event.id,
		serviceId: service.id,
		startTime: wallClockToInstant('2027-03-12', 19 * 60, ZONE),
		endTime: wallClockToInstant('2027-03-12', 22 * 60, ZONE),
	});
	return { event, serviceId: service.id };
}

describe('Draft completeness in the Events list', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('grades a bare Draft 4/8, naming the tabs still missing something', async () => {
		const draft = await seedBareDraft();
		const completeness = await loadCompleteness();
		expect(completeness[draft.id]).toMatchObject({ complete: 4, total: 8 });
		expect(
			completeness[draft.id].tabs
				.filter((tab) => tab.warnings.length > 0)
				.map((tab) => tab.title)
		).toEqual(['Essentiel', 'Lieu', 'Dates & séances', 'Visuels']);
	});

	it('grades a complete Draft 8/8', async () => {
		const { event } = await seedCompleteDraft();
		const completeness = await loadCompleteness();
		expect(completeness[event.id]).toMatchObject({ complete: 8, total: 8 });
		expect(completeness[event.id].tabs.every((tab) => tab.warnings.length === 0)).toBe(true);
	});

	it('counts a Service without its price under « Menus & tarifs »', async () => {
		const { event, serviceId } = await seedCompleteDraft();
		await testDb.update(eventServices).set({ priceAmount: null }).where(eq(eventServices.id, serviceId));
		const completeness = await loadCompleteness();
		expect(completeness[event.id]).toMatchObject({ complete: 7, total: 8 });
		expect(
			completeness[event.id].tabs.find((tab) => tab.tab === 'tarifs')?.warnings.map((w) => w.code)
		).toEqual(['service-without-price']);
	});

	it('leaves published Events out', async () => {
		await seedBareDraft();
		const [published] = await testDb
			.insert(events)
			.values({ visibility: 'public', timeZone: ZONE, titleFr: 'Publié' })
			.returning();
		const completeness = await loadCompleteness();
		expect(completeness[published.id]).toBeUndefined();
	});
});

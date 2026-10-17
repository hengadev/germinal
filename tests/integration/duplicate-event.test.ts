// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { isRedirect } from '@sveltejs/kit';
import {
	coupons,
	events,
	eventDays,
	eventMenus,
	eventServices,
	eventSessions,
	media,
	tasks,
} from '../../src/lib/server/db/schema';
import { getTestDatabase, setupTestDatabase, closeTestDatabase } from '../fixtures/database';
import { wallClockToInstant, dayStart, dayEnd } from '../../src/lib/utils/event-time';

// ---------------------------------------------------------------------------
// « Dupliquer » (issue 046): the copy is a Draft on the new Days, carrying
// the source's texts, venue, Menus, pricing and Programme, with every new
// lunch and dinner given the source's pattern — and nothing tied to the
// original (Visuals, Event Photos, Recap, Portfolio, Spotlight, Promo
// Codes, Tasks, booking opening date). The source is left as it was.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

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
const admin = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@test', role: 'admin', createdAt: new Date() };

async function duplicate(id: string, days: unknown) {
	const { actions } = await import('../../src/routes/(admin)/admin/events/+page.server');
	const form = new FormData();
	form.set('id', id);
	form.set('days', JSON.stringify(days));
	try {
		return await actions.duplicateEvent({
			locals: { user: admin },
			request: new Request('http://x/admin/events?/duplicateEvent', { method: 'POST', body: form }),
			params: {},
			url: new URL('http://x/admin/events?/duplicateEvent'),
		} as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return { status: thrown.status, location: thrown.location };
		throw thrown;
	}
}

function copyIdOf(result: unknown): string {
	expect(result).toMatchObject({ status: 303, location: expect.stringMatching(/^\/admin\/events\/[0-9a-f-]{36}$/) });
	return (result as { location: string }).location.split('/').pop()!;
}

const CARRIED = {
	titleEn: 'Spring table',
	titleFr: 'Table de printemps',
	subtitleEn: 'A subtitle',
	subtitleFr: 'Un sous-titre',
	descriptionEn: 'Description',
	descriptionFr: 'Descriptif',
	admissionInfoEn: 'Invitation only',
	admissionInfoFr: 'Sur invitation',
	practicalInfoEn: 'Door code 1234',
	practicalInfoFr: 'Code 1234',
	internalNotes: 'Client: Maison X',
	locationEn: 'Paris',
	locationFr: 'Paris',
	venueNameEn: 'The Garden',
	venueNameFr: 'Le Jardin',
	streetAddressEn: '1 rue de la Paix',
	streetAddressFr: '1 rue de la Paix',
	districtEn: '2nd',
	districtFr: '2e',
	cityEn: 'Paris',
	cityFr: 'Paris',
	postalCode: '75002',
	countryEn: 'France',
	countryFr: 'France',
	venueCapacity: 20,
	timeZone: ZONE,
	currency: 'CHF',
	depositType: 'percent' as const,
	depositValue: 30,
	refundPolicyType: 'manual' as const,
	refundPolicyTextEn: 'Ask us',
	refundPolicyTextFr: 'Contactez-nous',
	refundPolicyTiers: [{ hoursBefore: 48, percent: 50 }],
	timings: JSON.stringify([{ time: '19:00', label: 'Apéritif' }]),
	curatorEn: 'Jane',
	curatorFr: 'Jeanne',
	collaborators: JSON.stringify(['Studio A']),
	bookingClosesHoursBefore: 6,
	askDietaryRequirements: true,
};

async function seedSource() {
	const [source] = await testDb.insert(events).values({
		...CARRIED,
		visibility: 'public',
		isSpotlight: true,
		isPortfolio: true,
		recapEn: 'It went well',
		recapFr: 'Ce fut réussi',
		bookingOpensAt: new Date('2099-02-01T09:00:00Z'),
		startDate: dayStart('2099-03-10', ZONE),
		endDate: dayEnd('2099-03-11', ZONE),
	}).returning();

	const [visual] = await testDb.insert(media).values({
		type: 'image', url: 'https://x/v.jpg', s3Key: 'v', mimeType: 'image/jpeg', size: 1,
		eventId: source.id, role: 'visual', isCover: true,
	}).returning();
	await testDb.insert(media).values({
		type: 'image', url: 'https://x/p.jpg', s3Key: 'p', mimeType: 'image/jpeg', size: 1,
		eventId: source.id, role: 'event_photo', isCover: true,
	});
	await testDb.update(events).set({ coverMediaId: visual.id }).where(eq(events.id, source.id));

	const [lunchMenu, dinnerMenu] = await testDb.insert(eventMenus).values([
		{ eventId: source.id, nameEn: 'Lunch', nameFr: 'Déjeuner', descriptionFr: 'Trois plats' },
		{ eventId: source.id, nameEn: 'Tasting', nameFr: 'Dégustation' },
	]).returning();
	// Only the lunch Menu is ever served; the dinner one is still carried.
	void dinnerMenu;

	const [day1, day2] = await testDb.insert(eventDays).values([
		{ eventId: source.id, date: '2099-03-10' },
		{ eventId: source.id, date: '2099-03-11' },
	]).returning();
	const [lunch1, lunch2] = await testDb.insert(eventServices).values([
		{ dayId: day1.id, kind: 'lunch', defaultSeatingDurationMinutes: 75, menuId: lunchMenu.id, priceAmount: 4500 },
		{ dayId: day2.id, kind: 'lunch', defaultSeatingDurationMinutes: 200, priceAmount: 1 },
	]).returning();

	const at = (day: string, minutes: number) => wallClockToInstant(day, minutes, ZONE);
	await testDb.insert(eventSessions).values([
		{
			eventId: source.id, serviceId: lunch1.id,
			startTime: at('2099-03-10', 12 * 60), endTime: at('2099-03-10', 13 * 60 + 15),
			totalCapacity: 20, availableCapacity: 12, published: true, badgeType: 'popular', allowWaitlist: true,
		},
		{
			eventId: source.id, serviceId: lunch1.id,
			titleEn: 'Chef table', titleFr: 'Table du chef',
			startTime: at('2099-03-10', 13 * 60 + 30), endTime: at('2099-03-10', 15 * 60),
			totalCapacity: 8, availableCapacity: 3, capacityOverridden: true, published: true, badgeType: 'vip',
		},
		{
			eventId: source.id, serviceId: lunch2.id,
			startTime: at('2099-03-11', 11 * 60), endTime: at('2099-03-11', 12 * 60),
			totalCapacity: 20, availableCapacity: 20, published: true,
		},
	]);

	await testDb.insert(coupons).values({
		eventId: source.id, name: 'Promo', discountType: 'percent', discountValue: 10,
	});

	return source.id;
}

async function snapshot(eventId: string) {
	const [event] = await testDb.select().from(events).where(eq(events.id, eventId));
	const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, eventId));
	const services = days.length
		? await testDb.select().from(eventServices).where(inArray(eventServices.dayId, days.map((d) => d.id)))
		: [];
	const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, eventId));
	const menus = await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, eventId));
	const mediaRows = await testDb.select().from(media).where(eq(media.eventId, eventId));
	const couponRows = await testDb.select().from(coupons).where(eq(coupons.eventId, eventId));
	const taskRows = await testDb.select().from(tasks).where(eq(tasks.eventId, eventId));
	return { event, days, services, seatings, menus, media: mediaRows, coupons: couponRows, tasks: taskRows };
}

describe('« Dupliquer » an Event', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('creates a complete Draft on the new Days and leaves the source unchanged', async () => {
		const sourceId = await seedSource();
		const before = await snapshot(sourceId);

		const copyId = copyIdOf(await duplicate(sourceId, [
			{ date: '2099-06-05', kinds: ['lunch', 'dinner'] },
			{ date: '2099-06-12', kinds: ['lunch'] },
		]));
		expect(copyId).not.toBe(sourceId);

		const copy = await snapshot(copyId);
		expect(copy.event).toMatchObject({
			...CARRIED,
			titleEn: 'Copy of Spring table',
			titleFr: 'Copie de Table de printemps',
			visibility: 'draft',
			isSpotlight: false,
			isPortfolio: false,
			recapEn: null,
			recapFr: null,
			bookingOpensAt: null,
			coverMediaId: null,
			coverVideoId: null,
			startDate: dayStart('2099-06-05', ZONE),
			endDate: dayEnd('2099-06-12', ZONE),
		});
		expect(copy.media).toEqual([]);
		expect(copy.coupons).toEqual([]);
		expect(copy.tasks).toEqual([]);

		// Menus are copied, each new Service pointing at the copy's.
		expect(copy.menus.map((m) => m.nameFr).sort()).toEqual(['Dégustation', 'Déjeuner']);
		const copiedLunchMenu = copy.menus.find((m) => m.nameFr === 'Déjeuner')!;
		expect(copiedLunchMenu.descriptionFr).toBe('Trois plats');

		expect(copy.days.map((d) => String(d.date)).sort()).toEqual(['2099-06-05', '2099-06-12']);
		const dateOf = new Map(copy.days.map((d) => [d.id, String(d.date)]));
		const lunches = copy.services.filter((s) => s.kind === 'lunch');
		const dinners = copy.services.filter((s) => s.kind === 'dinner');
		expect(lunches).toHaveLength(2);
		expect(dinners).toHaveLength(1);

		// Every new lunch: the first lunch's duration, Menu, price and Seatings.
		for (const lunch of lunches) {
			expect(lunch).toMatchObject({ defaultSeatingDurationMinutes: 75, menuId: copiedLunchMenu.id, priceAmount: 4500 });
			const date = dateOf.get(lunch.dayId)!;
			const seatings = copy.seatings
				.filter((s) => s.serviceId === lunch.id)
				.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
			expect(seatings).toHaveLength(2);
			expect(seatings[0]).toMatchObject({
				startTime: wallClockToInstant(date, 12 * 60, ZONE),
				endTime: wallClockToInstant(date, 13 * 60 + 15, ZONE),
				totalCapacity: 20,
				availableCapacity: 20,
				capacityOverridden: false,
				badgeType: 'popular',
				allowWaitlist: true,
				published: true,
				titleFr: null,
			});
			expect(seatings[1]).toMatchObject({
				startTime: wallClockToInstant(date, 13 * 60 + 30, ZONE),
				endTime: wallClockToInstant(date, 15 * 60, ZONE),
				totalCapacity: 8,
				availableCapacity: 8,
				capacityOverridden: true,
				badgeType: 'vip',
				titleEn: 'Chef table',
				titleFr: 'Table du chef',
			});
		}

		// The source never served dinner: the new dinner starts empty.
		expect(dinners[0]).toMatchObject({ menuId: null, priceAmount: null });
		expect(copy.seatings.filter((s) => s.serviceId === dinners[0].id)).toEqual([]);

		expect(await snapshot(sourceId)).toEqual(before);
	});

	it('pre-ticks the meals each Event serves', async () => {
		const sourceId = await seedSource();
		const [empty] = await testDb.insert(events).values({ titleFr: 'Vide' }).returning();
		const { getServedKindsByEventIds } = await import('../../src/lib/server/services/event-duplicate');
		expect(await getServedKindsByEventIds([sourceId, empty.id])).toEqual({
			[sourceId]: ['lunch'],
			[empty.id]: [],
		});
	});

	it('asks for the new Days first and refuses an unknown Event', async () => {
		const sourceId = await seedSource();
		expect(await duplicate(sourceId, [])).toMatchObject({ status: 400 });
		expect(await duplicate('00000000-0000-4000-8000-00000000abcd', [{ date: '2099-06-05', kinds: ['dinner'] }]))
			.toMatchObject({ status: 404 });
		const all = await testDb.select({ id: events.id }).from(events);
		expect(all).toHaveLength(1);
	});
});

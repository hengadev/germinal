// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { isRedirect } from '@sveltejs/kit';
import {
	events,
	eventDays,
	eventMenus,
	eventServices,
	eventSessions,
	media,
} from '../../src/lib/server/db/schema';
import { getTestDatabase, setupTestDatabase, closeTestDatabase } from '../fixtures/database';

// ---------------------------------------------------------------------------
// « Nouvel événement » is the Event editor with no Event (ADR 0008, issue
// 036): the first save of any tab creates a Draft with what it holds and
// lands on its page. The schedule tabs save the Days and meals, the
// Seatings and « Menus & tarifs » together — the last two posted for
// Services that do not exist yet, named by placeholder ids.
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

const LUNCH_REF = '11111111-1111-4111-8111-111111111111';
const DINNER_REF = '22222222-2222-4222-8222-222222222222';
const admin = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@test', role: 'admin', createdAt: new Date() };

function seating(start: string) {
	return {
		id: null,
		start,
		end: null,
		titleEn: null,
		titleFr: null,
		descriptionEn: null,
		descriptionFr: null,
		capacityOverride: null,
		published: true,
		allowWaitlist: false,
		badgeType: 'none',
	};
}

function createForm(dinnerStart = '19:30'): FormData {
	const form = new FormData();
	const fields: Record<string, string> = {
		venueCapacity: '24',
		days: JSON.stringify([{ date: '2099-11-14', kinds: ['lunch', 'dinner'] }]),
		serviceRefs: JSON.stringify([
			{ ref: LUNCH_REF, date: '2099-11-14', kind: 'lunch' },
			{ ref: DINNER_REF, date: '2099-11-14', kind: 'dinner' },
		]),
		services: JSON.stringify([
			{ serviceId: LUNCH_REF, defaultDurationMinutes: 90, seatings: [] },
			{ serviceId: DINNER_REF, defaultDurationMinutes: 120, seatings: [seating(dinnerStart), seating('21:30')] },
		]),
		pricing: JSON.stringify({
			menus: [{ key: 'new-1', id: null, nameEn: 'Tasting', nameFr: 'Dégustation', descriptionEn: null, descriptionFr: null }],
			services: [
				{ serviceId: LUNCH_REF, menuKey: null, priceAmount: null, clearLegacyPrices: false },
				{ serviceId: DINNER_REF, menuKey: 'new-1', priceAmount: 8500, clearLegacyPrices: false },
			],
			currency: 'CHF',
			deposit: { type: 'percent', value: 30 },
			refundPolicy: { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 48, percent: 100 }] },
		}),
	};
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return form;
}

type NewEventAction = 'updateEvent' | 'updateMedia' | 'saveSeatings' | 'savePricing';

/** Post a tab of the new-Event editor; a redirect (first save) is returned
 * as `{ location }` instead of thrown. */
async function submit(form: FormData, action: NewEventAction = 'saveSeatings') {
	const { actions } = await import('../../src/routes/(admin)/admin/events/new/+page.server');
	try {
		return await actions[action]({
			locals: { user: admin },
			request: new Request(`http://x/admin/events/new?/${action}`, { method: 'POST', body: form }),
			params: {},
			url: new URL(`http://x/admin/events/new?/${action}`),
		} as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return { status: thrown.status, location: thrown.location };
		throw thrown;
	}
}

/** The redirect a first save answers with: the new Draft's page. */
const DRAFT_PAGE = { status: 303, location: expect.stringMatching(/^\/admin\/events\/[0-9a-f-]{36}$/) };

/** The id of the Draft a first save landed on. */
function draftIdOf(result: unknown): string {
	expect(result).toMatchObject(DRAFT_PAGE);
	return (result as { location: string }).location.split('/').pop()!;
}

async function eventById(id: string) {
	const [event] = await testDb.select().from(events).where(eq(events.id, id));
	return event;
}

describe('first save of « Dates & séances » on a new Event', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('creates a Draft with the Days, Seatings, Menu, price, currency, Deposit and Refund Policy', async () => {
		const event = await eventById(draftIdOf(await submit(createForm())));
		expect(event).toMatchObject({
			visibility: 'draft',
			isSpotlight: false,
			titleEn: null,
			titleFr: null,
			venueCapacity: 24,
			currency: 'CHF',
			depositType: 'percent',
			depositValue: 30,
			refundPolicyType: 'rules',
			refundPolicyTiers: [{ hoursBefore: 48, percent: 100 }],
		});

		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id));
		expect(days).toHaveLength(1);
		const services = await testDb.select().from(eventServices).where(eq(eventServices.dayId, days[0].id));
		const lunch = services.find((service) => service.kind === 'lunch')!;
		const dinner = services.find((service) => service.kind === 'dinner')!;
		const [menu] = await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, event.id));
		expect(menu.nameFr).toBe('Dégustation');
		expect(dinner).toMatchObject({ menuId: menu.id, priceAmount: 8500, defaultSeatingDurationMinutes: 120 });
		expect(lunch).toMatchObject({ menuId: null, priceAmount: null });

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(seatings).toHaveLength(2);
		for (const row of seatings) {
			expect(row.serviceId).toBe(dinner.id);
			expect(row.totalCapacity).toBe(24);
			expect(row.availableCapacity).toBe(24);
		}
		// Typed in the default Time Zone, Europe/Paris (UTC+1 in November).
		expect(event.timeZone).toBe('Europe/Paris');
		expect(seatings.map((row) => row.startTime.toISOString()).sort()).toEqual([
			'2099-11-14T18:30:00.000Z',
			'2099-11-14T20:30:00.000Z',
		]);
		expect(event.startDate!.toISOString()).toBe('2099-11-13T23:00:00.000Z');
		expect(event.endDate!.toISOString()).toBe('2099-11-14T22:59:59.999Z');
	});

	it('saves the same schedule from « Menus & tarifs »', async () => {
		const event = await eventById(draftIdOf(await submit(createForm(), 'savePricing')));
		expect(await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id))).toHaveLength(2);
		expect(await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, event.id))).toHaveLength(1);
	});

	it('types the Seatings in the Time Zone picked with the venue', async () => {
		const form = createForm();
		form.set('timeZone', 'Europe/London');
		const event = await eventById(draftIdOf(await submit(form)));
		expect(event.timeZone).toBe('Europe/London');
		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, event.id));
		expect(seatings.map((row) => row.startTime.toISOString()).sort()).toEqual([
			'2099-11-14T19:30:00.000Z',
			'2099-11-14T21:30:00.000Z',
		]);
		expect(event.startDate!.toISOString()).toBe('2099-11-14T00:00:00.000Z');
	});

	it('refuses a Time Zone that is not an IANA name', async () => {
		const form = createForm();
		form.set('timeZone', 'Mars/Olympus');
		expect(await submit(form)).toMatchObject({ status: 400, data: { error: 'Le fuseau horaire choisi est invalide.' } });
		expect(await testDb.select().from(events)).toHaveLength(0);
	});

	it('creates a Draft from the Venue Capacity alone, without Days', async () => {
		const form = new FormData();
		form.set('days', '[]');
		form.set('venueCapacity', '30');
		const event = await eventById(draftIdOf(await submit(form)));
		expect(event).toMatchObject({ venueCapacity: 30, startDate: null, endDate: null, visibility: 'draft' });
		expect(await testDb.select().from(eventDays).where(eq(eventDays.eventId, event.id))).toHaveLength(0);
	});

	it('saves the Booking Window with the first save, typed in the Event’s Time Zone', async () => {
		const form = createForm();
		form.set('bookingOpensAt', '2099-10-01T10:00');
		form.set('bookingClosesHoursBefore', '24');
		const event = await eventById(draftIdOf(await submit(form)));
		// Europe/Paris is UTC+2 on 1 October.
		expect(event.bookingOpensAt!.toISOString()).toBe('2099-10-01T08:00:00.000Z');
		expect(event.bookingClosesHoursBefore).toBe(24);
	});

	it('creates a Draft from the Booking Window alone', async () => {
		const form = new FormData();
		form.set('days', '[]');
		form.set('bookingClosesHoursBefore', '12');
		const event = await eventById(draftIdOf(await submit(form)));
		expect(event).toMatchObject({ bookingClosesHoursBefore: 12, visibility: 'draft' });
	});

	it('creates nothing when a Seating is refused', async () => {
		// A dinner Seating starting at lunch time is refused by the save.
		const result = await submit(createForm('12:00'));
		expect(result).toMatchObject({
			status: 400,
			data: { error: expect.stringContaining('ne correspond pas à son repas') },
		});

		expect(await testDb.select().from(events)).toHaveLength(0);
		expect(await testDb.select().from(eventDays)).toHaveLength(0);
		expect(await testDb.select().from(eventMenus)).toHaveLength(0);
	});

	it('refuses a placeholder that names no picked meal, before creating anything', async () => {
		const form = createForm();
		form.set('serviceRefs', JSON.stringify([{ ref: DINNER_REF, date: '2099-11-15', kind: 'dinner' }]));
		const result = await submit(form);
		expect(result).toMatchObject({ status: 400 });
		expect(await testDb.select().from(events)).toHaveLength(0);
	});
});

describe('first save of the other tabs on a new Event', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('creates a Draft from a single field, and nothing else', async () => {
		const form = new FormData();
		form.set('titleFr', 'Dîner des Moissons');
		form.set('titleEn', '');
		form.set('descriptionEn', '');
		form.set('descriptionFr', '');
		form.set('subtitleEn', '');
		form.set('subtitleFr', '');
		const event = await eventById(draftIdOf(await submit(form, 'updateEvent')));

		expect(event).toMatchObject({
			titleFr: 'Dîner des Moissons',
			titleEn: null,
			descriptionEn: null,
			descriptionFr: null,
			locationEn: null,
			locationFr: null,
			startDate: null,
			endDate: null,
			venueCapacity: null,
			visibility: 'draft',
			isSpotlight: false,
			timeZone: 'Europe/Paris',
		});
		expect(await testDb.select().from(events)).toHaveLength(1);
		expect(await testDb.select().from(eventDays)).toHaveLength(0);
	});

	it('creates a Draft from the Lieu tab with its Time Zone', async () => {
		const form = new FormData();
		form.set('cityEn', 'London');
		form.set('locationEn', '');
		form.set('timeZone', 'Europe/London');
		const event = await eventById(draftIdOf(await submit(form, 'updateEvent')));
		expect(event).toMatchObject({ cityEn: 'London', locationEn: null, timeZone: 'Europe/London' });
	});

	it('creates nothing when nothing is filled in, whichever tab is saved', async () => {
		const essentiel = new FormData();
		for (const name of ['titleEn', 'titleFr', 'descriptionEn', 'descriptionFr', 'subtitleEn', 'subtitleFr']) {
			essentiel.set(name, ' ');
		}
		const programme = new FormData();
		programme.set('collaborators', '[]');
		programme.set('timings', '[]');
		const lieu = new FormData();
		lieu.set('locationEn', '');
		lieu.set('timeZone', 'Europe/Paris');
		const visuels = new FormData();
		visuels.set('coverMediaId', '');
		visuels.set('galleryMediaIds', '[]');
		const schedule = new FormData();
		schedule.set('days', '[]');
		schedule.set('serviceRefs', '[]');
		schedule.set('services', '[]');
		schedule.set('venueCapacity', '');
		schedule.set('pricing', JSON.stringify({
			menus: [],
			services: [],
			deposit: { type: 'percent', value: 100 },
			refundPolicy: { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 24, percent: 100 }] },
		}));

		const nothing = { status: 400, data: { error: expect.stringContaining('Rien à enregistrer') } };
		expect(await submit(essentiel, 'updateEvent')).toMatchObject(nothing);
		expect(await submit(programme, 'updateEvent')).toMatchObject(nothing);
		expect(await submit(lieu, 'updateEvent')).toMatchObject(nothing);
		expect(await submit(visuels, 'updateMedia')).toMatchObject(nothing);
		expect(await submit(schedule, 'saveSeatings')).toMatchObject(nothing);
		expect(await submit(schedule, 'savePricing')).toMatchObject(nothing);
		expect(await testDb.select().from(events)).toHaveLength(0);
	});

	it('creates a Draft from the Visuels tab and links the uploads to it', async () => {
		const [upload] = await testDb.insert(media).values({
			type: 'image',
			url: 'https://cdn.test/cover.jpg',
			s3Key: 'events/cover.jpg',
			mimeType: 'image/jpeg',
			size: 1000,
		}).returning();
		const form = new FormData();
		form.set('coverMediaId', upload.id);
		form.set('galleryMediaIds', '[]');
		const event = await eventById(draftIdOf(await submit(form, 'updateMedia')));

		expect(event.coverMediaId).toBe(upload.id);
		const [linked] = await testDb.select().from(media).where(eq(media.id, upload.id));
		expect(linked).toMatchObject({ eventId: event.id, isCover: true });
	});

	it('updates only the posted tab’s fields once the Draft exists', async () => {
		const first = new FormData();
		first.set('titleFr', 'Dîner des Moissons');
		const id = draftIdOf(await submit(first, 'updateEvent'));

		const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
		const lieu = new FormData();
		lieu.set('cityFr', 'Lyon');
		const result = await actions.updateEvent!({
			locals: { user: admin },
			request: new Request(`http://x/admin/events/${id}?/updateEvent`, { method: 'POST', body: lieu }),
			params: { id },
			url: new URL(`http://x/admin/events/${id}?/updateEvent`),
		} as never);
		expect(result).toMatchObject({ success: expect.any(String) });
		expect(await eventById(id)).toMatchObject({ titleFr: 'Dîner des Moissons', cityFr: 'Lyon', visibility: 'draft' });
	});
});

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
// « Nouvel événement » creates an empty Draft at once and opens its page
// (ADR 0010, issue 014). Every tab then saves onto that Draft with its own
// save, « Dates & séances » and « Menus & tarifs » each on their own.
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

/** « Dates & séances » for one Day, both meals picked but not saved yet. */
function seatingsForm(dinnerStart = '19:30'): FormData {
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
	};
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	return form;
}

/** « Dates & séances » with no Day picked, as a new Draft holds it. */
function noDaysForm(): FormData {
	const form = new FormData();
	form.set('days', '[]');
	form.set('serviceRefs', '[]');
	form.set('services', '[]');
	form.set('venueCapacity', '');
	return form;
}

/** Post « Nouvel événement »; the redirect it answers with is returned as
 * `{ status, location }` instead of thrown. */
async function createEvent(user: Record<string, unknown> = admin) {
	const { actions } = await import('../../src/routes/(admin)/admin/events/+page.server');
	try {
		return await actions.createEvent!({
			locals: { user },
			request: new Request('http://x/admin/events?/createEvent', { method: 'POST' }),
			params: {},
			url: new URL('http://x/admin/events?/createEvent'),
		} as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return { status: thrown.status, location: thrown.location };
		throw thrown;
	}
}

/** The id of the Draft « Nouvel événement » created and opened. */
async function newDraft(): Promise<string> {
	const result = await createEvent();
	expect(result).toMatchObject({ status: 303, location: expect.stringMatching(/^\/admin\/events\/[0-9a-f-]{36}$/) });
	return (result as { location: string }).location.split('/').pop()!;
}

type EditorAction = 'updateEvent' | 'updateMedia' | 'saveSeatings' | 'savePricing';

/** Save a tab of the Draft's editor. */
async function save(id: string, action: EditorAction, form: FormData) {
	const { actions } = await import('../../src/routes/(admin)/admin/events/[id]/+page.server');
	return actions[action]!({
		locals: { user: admin },
		request: new Request(`http://x/admin/events/${id}?/${action}`, { method: 'POST', body: form }),
		params: { id },
		url: new URL(`http://x/admin/events/${id}?/${action}`),
	} as never);
}

const SAVED = { success: expect.any(String) };

async function eventById(id: string) {
	const [event] = await testDb.select().from(events).where(eq(events.id, id));
	return event;
}

describe('« Nouvel événement »', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('creates an empty Draft in the default Time Zone and opens its page', async () => {
		const event = await eventById(await newDraft());
		expect(event).toMatchObject({
			visibility: 'draft',
			isSpotlight: false,
			isPortfolio: false,
			titleEn: null,
			titleFr: null,
			cityFr: null,
			startDate: null,
			endDate: null,
			venueCapacity: null,
			coverMediaId: null,
			timeZone: 'Europe/Paris',
		});
		expect(await testDb.select().from(events)).toHaveLength(1);
		expect(await testDb.select().from(eventDays)).toHaveLength(0);
	});

	it('creates a new Draft on every post', async () => {
		await newDraft();
		await newDraft();
		expect(await testDb.select().from(events)).toHaveLength(2);
	});

	it('creates nothing for a staff session', async () => {
		await expect(createEvent({ ...admin, role: 'staff' })).rejects.toMatchObject({ status: 403 });
		expect(await testDb.select().from(events)).toHaveLength(0);
	});
});

describe('« Dates & séances » and « Menus & tarifs » on the new Draft', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('saves the Days, Seatings and Venue Capacity on their own', async () => {
		const id = await newDraft();
		expect(await save(id, 'saveSeatings', seatingsForm())).toMatchObject(SAVED);

		const event = await eventById(id);
		expect(event).toMatchObject({ venueCapacity: 24, visibility: 'draft' });
		const days = await testDb.select().from(eventDays).where(eq(eventDays.eventId, id));
		expect(days).toHaveLength(1);
		const services = await testDb.select().from(eventServices).where(eq(eventServices.dayId, days[0].id));
		const dinner = services.find((service) => service.kind === 'dinner')!;
		expect(dinner.defaultSeatingDurationMinutes).toBe(120);

		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, id));
		expect(seatings).toHaveLength(2);
		for (const row of seatings) {
			expect(row.serviceId).toBe(dinner.id);
			expect(row.totalCapacity).toBe(24);
			expect(row.availableCapacity).toBe(24);
		}
		// Typed in the default Time Zone, Europe/Paris (UTC+1 in November).
		expect(seatings.map((row) => row.startTime.toISOString()).sort()).toEqual([
			'2099-11-14T18:30:00.000Z',
			'2099-11-14T20:30:00.000Z',
		]);
		expect(event.startDate!.toISOString()).toBe('2099-11-13T23:00:00.000Z');
		expect(event.endDate!.toISOString()).toBe('2099-11-14T22:59:59.999Z');
	});

	it('saves the Menus, prices, currency, Deposit and Refund Policy on their own', async () => {
		const id = await newDraft();
		await save(id, 'saveSeatings', seatingsForm());
		const [day] = await testDb.select().from(eventDays).where(eq(eventDays.eventId, id));
		const services = await testDb.select().from(eventServices).where(eq(eventServices.dayId, day.id));
		const lunch = services.find((service) => service.kind === 'lunch')!;
		const dinner = services.find((service) => service.kind === 'dinner')!;

		const form = new FormData();
		form.set('pricing', JSON.stringify({
			menus: [{ key: 'new-1', id: null, nameEn: 'Tasting', nameFr: 'Dégustation', descriptionEn: null, descriptionFr: null }],
			services: [
				{ serviceId: lunch.id, menuKey: null, priceAmount: null, clearLegacyPrices: false },
				{ serviceId: dinner.id, menuKey: 'new-1', priceAmount: 8500, clearLegacyPrices: false },
			],
			currency: 'CHF',
			deposit: { type: 'percent', value: 30 },
			refundPolicy: { type: 'rules', textEn: null, textFr: null, tiers: [{ hoursBefore: 48, percent: 100 }] },
		}));
		expect(await save(id, 'savePricing', form)).toMatchObject(SAVED);

		expect(await eventById(id)).toMatchObject({
			currency: 'CHF',
			depositType: 'percent',
			depositValue: 30,
			refundPolicyType: 'rules',
			refundPolicyTiers: [{ hoursBefore: 48, percent: 100 }],
		});
		const [menu] = await testDb.select().from(eventMenus).where(eq(eventMenus.eventId, id));
		expect(menu.nameFr).toBe('Dégustation');
		const priced = await testDb.select().from(eventServices).where(eq(eventServices.dayId, day.id));
		expect(priced.find((service) => service.id === dinner.id)).toMatchObject({ menuId: menu.id, priceAmount: 8500 });
		expect(priced.find((service) => service.id === lunch.id)).toMatchObject({ menuId: null, priceAmount: null });
	});

	it('types the Seatings in the Time Zone saved with the venue', async () => {
		const id = await newDraft();
		const lieu = new FormData();
		lieu.set('timeZone', 'Europe/London');
		expect(await save(id, 'updateEvent', lieu)).toMatchObject(SAVED);
		await save(id, 'saveSeatings', seatingsForm());

		const event = await eventById(id);
		expect(event.timeZone).toBe('Europe/London');
		const seatings = await testDb.select().from(eventSessions).where(eq(eventSessions.eventId, id));
		expect(seatings.map((row) => row.startTime.toISOString()).sort()).toEqual([
			'2099-11-14T19:30:00.000Z',
			'2099-11-14T21:30:00.000Z',
		]);
		expect(event.startDate!.toISOString()).toBe('2099-11-14T00:00:00.000Z');
	});

	it('saves the Venue Capacity alone, without Days', async () => {
		const id = await newDraft();
		const form = noDaysForm();
		form.set('venueCapacity', '30');
		expect(await save(id, 'saveSeatings', form)).toMatchObject(SAVED);
		expect(await eventById(id)).toMatchObject({ venueCapacity: 30, startDate: null, endDate: null, visibility: 'draft' });
		expect(await testDb.select().from(eventDays).where(eq(eventDays.eventId, id))).toHaveLength(0);
	});

	it('saves the Booking Window alone, typed in the Event’s Time Zone', async () => {
		const id = await newDraft();
		const form = noDaysForm();
		form.set('bookingOpensAt', '2099-10-01T10:00');
		form.set('bookingClosesHoursBefore', '24');
		expect(await save(id, 'saveSeatings', form)).toMatchObject(SAVED);
		const event = await eventById(id);
		// Europe/Paris is UTC+2 on 1 October.
		expect(event.bookingOpensAt!.toISOString()).toBe('2099-10-01T08:00:00.000Z');
		expect(event.bookingClosesHoursBefore).toBe(24);
	});

	it('refuses a Seating that does not fit its meal, saving nothing', async () => {
		const id = await newDraft();
		// A dinner Seating starting at lunch time is refused by the save.
		expect(await save(id, 'saveSeatings', seatingsForm('12:00'))).toMatchObject({
			status: 400,
			data: { error: expect.stringContaining('ne correspond pas à son repas') },
		});
		expect(await testDb.select().from(eventSessions)).toHaveLength(0);
		expect(await eventById(id)).toMatchObject({ visibility: 'draft' });
	});

	it('still refuses to remove every saved Day', async () => {
		const id = await newDraft();
		await save(id, 'saveSeatings', seatingsForm());
		expect(await save(id, 'saveSeatings', noDaysForm())).toMatchObject({ status: 400 });
		expect(await testDb.select().from(eventDays).where(eq(eventDays.eventId, id))).toHaveLength(1);
	});

	it('refuses a placeholder that names no picked meal', async () => {
		const id = await newDraft();
		const form = seatingsForm();
		form.set('serviceRefs', JSON.stringify([{ ref: DINNER_REF, date: '2099-11-15', kind: 'dinner' }]));
		expect(await save(id, 'saveSeatings', form)).toMatchObject({ status: 400 });
		expect(await testDb.select().from(eventDays)).toHaveLength(0);
	});
});

describe('the other tabs on the new Draft', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('saves a single field, and nothing else', async () => {
		const id = await newDraft();
		const form = new FormData();
		form.set('titleFr', 'Dîner des Moissons');
		form.set('titleEn', '');
		form.set('descriptionEn', '');
		form.set('descriptionFr', '');
		form.set('subtitleEn', '');
		form.set('subtitleFr', '');
		expect(await save(id, 'updateEvent', form)).toMatchObject(SAVED);

		expect(await eventById(id)).toMatchObject({
			titleFr: 'Dîner des Moissons',
			titleEn: null,
			descriptionFr: null,
			locationFr: null,
			startDate: null,
			venueCapacity: null,
			visibility: 'draft',
			isSpotlight: false,
			timeZone: 'Europe/Paris',
		});
		expect(await testDb.select().from(events)).toHaveLength(1);
	});

	it('saves the tab even with nothing filled in', async () => {
		const id = await newDraft();
		const form = new FormData();
		form.set('titleFr', ' ');
		expect(await save(id, 'updateEvent', form)).toMatchObject(SAVED);
		expect(await eventById(id)).toMatchObject({ titleFr: null, visibility: 'draft' });
	});

	it('updates only the posted tab’s fields', async () => {
		const id = await newDraft();
		const essentiel = new FormData();
		essentiel.set('titleFr', 'Dîner des Moissons');
		await save(id, 'updateEvent', essentiel);
		const lieu = new FormData();
		lieu.set('cityFr', 'Lyon');
		expect(await save(id, 'updateEvent', lieu)).toMatchObject(SAVED);
		expect(await eventById(id)).toMatchObject({ titleFr: 'Dîner des Moissons', cityFr: 'Lyon', visibility: 'draft' });
	});

	it('links the Visuels uploads to the Draft', async () => {
		const id = await newDraft();
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
		expect(await save(id, 'updateMedia', form)).toMatchObject({ success: expect.any(String) });

		expect((await eventById(id)).coverMediaId).toBe(upload.id);
		const [linked] = await testDb.select().from(media).where(eq(media.id, upload.id));
		expect(linked).toMatchObject({ eventId: id, isCover: true });
	});
});

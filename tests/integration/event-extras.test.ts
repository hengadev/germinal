// @vitest-environment node
/**
 * Issue 067 — the Event editor's extras section.
 *
 * Saving creates, updates, reorders and deactivates extras; parsing
 * validates names, price and stock; an extra already booked on a
 * Reservation can be deactivated but not deleted.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations, reservationExtras } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import type {
	loadExtrasEditor as loadExtrasEditorFn,
	parseExtrasPayload as parseExtrasPayloadFn,
	saveExtras as saveExtrasFn,
} from '../../src/lib/server/services/event-extras';

const testDb = getTestDatabase();

// Imported once the `db` mock is in place (the service reads `db` at
// module level).
let loadExtrasEditor: typeof loadExtrasEditorFn;
let parseExtrasPayload: typeof parseExtrasPayloadFn;
let saveExtras: typeof saveExtrasFn;
let ExtraInUseError: typeof import('../../src/lib/server/services/event-extras').ExtraInUseError;
let UnknownExtraTargetError: typeof import('../../src/lib/server/services/event-extras').UnknownExtraTargetError;
beforeEach(async () => {
	({ loadExtrasEditor, parseExtrasPayload, saveExtras, ExtraInUseError, UnknownExtraTargetError } =
		await import('../../src/lib/server/services/event-extras'));
	await setupTestDatabase();
});

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
	},
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

async function seedEvent() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Summer Table',
			titleFr: "Table d'été",
			descriptionEn: 'd',
			descriptionFr: 'd',
			startDate: new Date('2099-06-10'),
			endDate: new Date('2099-06-10'),
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
		})
		.returning();
	return event;
}

async function seedReservation(eventId: string) {
	const startTime = new Date('2099-06-10T19:00:00Z');
	const endTime = new Date('2099-06-10T21:00:00Z');
	const serviceId = await seedServiceForSession(testDb, eventId, startTime, endTime);
	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
			serviceId,
			startTime,
			endTime,
			totalCapacity: 40,
			availableCapacity: 40,
			published: true,
		})
		.returning();
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: session.id,
			guestEmail: 'guest@example.com',
			guestName: 'Guest',
			quantity: 2,
			totalAmount: 0,
			depositAmount: 0,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'confirmed',
			accessToken: `atk-extras-${Date.now()}`,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
		})
		.returning();
	return reservation;
}

describe('parseExtrasPayload', () => {
	it('parses a full payload', () => {
		const parsed = parseExtrasPayload(JSON.stringify({
			extras: [
				{ key: 'a', id: null, nameFr: 'Accord vins', nameEn: 'Wine pairing', descriptionFr: null, descriptionEn: null, priceAmount: 2500, unit: 'per_person', stock: 20, active: true },
				{ key: 'b', id: null, nameFr: 'Atelier', nameEn: 'Workshop', descriptionFr: ' ', descriptionEn: '', priceAmount: 0, unit: 'per_unit', stock: null, active: false },
			],
		}));
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.payload.extras).toHaveLength(2);
			expect(parsed.payload.extras[1].descriptionFr).toBeNull();
			expect(parsed.payload.extras[1].descriptionEn).toBeNull();
		}
	});

	it('refuses a missing English name', () => {
		const parsed = parseExtrasPayload(JSON.stringify({
			extras: [{ key: 'a', id: null, nameFr: 'Vins', nameEn: '', priceAmount: 100, unit: 'per_person', stock: null, active: true }],
		}));
		expect(parsed).toEqual({ ok: false, reason: 'name' });
	});

	it('refuses a negative price or stock', () => {
		const price = parseExtrasPayload(JSON.stringify({
			extras: [{ key: 'a', id: null, nameFr: 'V', nameEn: 'W', priceAmount: -1, unit: 'per_unit', stock: null, active: true }],
		}));
		expect(price).toEqual({ ok: false, reason: 'price' });
		const stock = parseExtrasPayload(JSON.stringify({
			extras: [{ key: 'a', id: null, nameFr: 'V', nameEn: 'W', priceAmount: 1, unit: 'per_unit', stock: -2, active: true }],
		}));
		expect(stock).toEqual({ ok: false, reason: 'stock' });
	});

	it('refuses a missing payload', () => {
		expect(parseExtrasPayload(null)).toEqual({ ok: false, reason: 'missing' });
	});
});

describe('saveExtras', () => {
	it('creates, reorders, updates and deactivates extras', async () => {
		const event = await seedEvent();
		const first = await saveExtras(event.id, { extras: [
			{ key: 'wine', id: null, nameFr: 'Accord vins', nameEn: 'Wine pairing', descriptionFr: null, descriptionEn: null, priceAmount: 2500, unit: 'per_person', stock: 20, active: true },
			{ key: 'kit', id: null, nameFr: 'Kit', nameEn: 'Kit', descriptionFr: null, descriptionEn: null, priceAmount: 500, unit: 'per_unit', stock: null, active: true },
		] });
		const wineId = first.extraIds.wine;
		expect(wineId).toBeTruthy();

		// Reversed order, wine deactivated and reworded, kit kept, a new one added.
		const second = await saveExtras(event.id, { extras: [
			{ key: 'kit', id: first.extraIds.kit, nameFr: 'Kit', nameEn: 'Kit', descriptionFr: null, descriptionEn: null, priceAmount: 500, unit: 'per_unit', stock: null, active: true },
			{ key: 'new', id: null, nameFr: 'Atelier', nameEn: 'Workshop', descriptionFr: null, descriptionEn: null, priceAmount: 0, unit: 'per_unit', stock: 5, active: true },
			{ key: 'wine', id: wineId, nameFr: 'Accord mets-vins', nameEn: 'Wine pairing', descriptionFr: 'Verre par service', descriptionEn: null, priceAmount: 3000, unit: 'per_person', stock: 20, active: false },
		] });
		expect(second.extraIds.wine).toBe(wineId);

		const loaded = await loadExtrasEditor(event.id);
		expect(loaded.map((extra) => extra.nameFr)).toEqual(['Kit', 'Atelier', 'Accord mets-vins']);
		expect(loaded.map((extra) => extra.position)).toEqual([0, 1, 2]);
		const wine = loaded.find((extra) => extra.id === wineId)!;
		expect(wine.active).toBe(false);
		expect(wine.priceAmount).toBe(3000);
		expect(wine.descriptionFr).toBe('Verre par service');
	});

	it('deletes extras left out of the payload', async () => {
		const event = await seedEvent();
		const { extraIds } = await saveExtras(event.id, { extras: [
			{ key: 'a', id: null, nameFr: 'A', nameEn: 'A', descriptionFr: null, descriptionEn: null, priceAmount: 100, unit: 'per_unit', stock: null, active: true },
			{ key: 'b', id: null, nameFr: 'B', nameEn: 'B', descriptionFr: null, descriptionEn: null, priceAmount: 100, unit: 'per_unit', stock: null, active: true },
		] });
		await saveExtras(event.id, { extras: [
			{ key: 'b', id: extraIds.b, nameFr: 'B', nameEn: 'B', descriptionFr: null, descriptionEn: null, priceAmount: 100, unit: 'per_unit', stock: null, active: true },
		] });
		const loaded = await loadExtrasEditor(event.id);
		expect(loaded.map((extra) => extra.nameFr)).toEqual(['B']);
	});

	it('refuses deleting an extra already booked, but allows deactivating it', async () => {
		const event = await seedEvent();
		const reservation = await seedReservation(event.id);
		const { extraIds } = await saveExtras(event.id, { extras: [
			{ key: 'wine', id: null, nameFr: 'Accord vins', nameEn: 'Wine pairing', descriptionFr: null, descriptionEn: null, priceAmount: 2500, unit: 'per_person', stock: 20, active: true },
		] });
		await testDb.insert(reservationExtras).values({
			reservationId: reservation.id,
			eventExtraId: extraIds.wine,
			nameFr: 'Accord vins',
			nameEn: 'Wine pairing',
			unitPrice: 2500,
			unit: 'per_person',
			quantity: 2,
		});

		// Deleting (leaving it out) is refused.
		await expect(saveExtras(event.id, { extras: [] })).rejects.toBeInstanceOf(ExtraInUseError);
		expect((await loadExtrasEditor(event.id))[0].booked).toBe(true);

		// Deactivating it goes through.
		await saveExtras(event.id, { extras: [
			{ key: 'wine', id: extraIds.wine, nameFr: 'Accord vins', nameEn: 'Wine pairing', descriptionFr: null, descriptionEn: null, priceAmount: 2500, unit: 'per_person', stock: 20, active: false },
		] });
		const loaded = await loadExtrasEditor(event.id);
		expect(loaded).toHaveLength(1);
		expect(loaded[0].active).toBe(false);
		expect(loaded[0].booked).toBe(true);
	});

	it('refuses an extra of another Event', async () => {
		const event = await seedEvent();
		const other = await seedEvent();
		const { extraIds } = await saveExtras(other.id, { extras: [
			{ key: 'a', id: null, nameFr: 'A', nameEn: 'A', descriptionFr: null, descriptionEn: null, priceAmount: 100, unit: 'per_unit', stock: null, active: true },
		] });
		await expect(saveExtras(event.id, { extras: [
			{ key: 'a', id: extraIds.a, nameFr: 'A', nameEn: 'A', descriptionFr: null, descriptionEn: null, priceAmount: 100, unit: 'per_unit', stock: null, active: true },
		] })).rejects.toBeInstanceOf(UnknownExtraTargetError);
	});
});

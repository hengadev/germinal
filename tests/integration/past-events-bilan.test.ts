// @vitest-environment node
/**
 * Issue 058 — the Admin Bilan page's Event listing: past Events only
 * (over = last Seating ended), newest first, with the period filter.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

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

let seq = 0;
async function seedEvent(titleFr: string) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: titleFr,
			titleFr,
			descriptionEn: 'd',
			descriptionFr: 'd',
			startDate: new Date('2025-01-01'),
			endDate: new Date('2025-01-01'),
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			depositType: 'fixed',
			depositValue: 2000,
		})
		.returning();
	return event;
}

async function seedSeating(
	eventId: string,
	start: string,
	end: string,
	capacity: number | null = 40
) {
	const startTime = new Date(start);
	const endTime = new Date(end);
	const [row] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
			serviceId: await seedServiceForSession(testDb, eventId, startTime, endTime),
			startTime,
			endTime,
			totalCapacity: capacity,
			availableCapacity: capacity ?? 40,
			published: true,
		})
		.returning();
	return row;
}

async function seedReservation(sessionId: string, quantity: number) {
	seq += 1;
	await testDb.insert(reservations).values({
		eventSessionId: sessionId,
		guestEmail: `bilan${seq}@example.com`,
		guestName: `Guest ${seq}`,
		quantity,
		totalAmount: 0,
		depositAmount: 0,
		balanceAmount: 0,
		currency: 'EUR',
		status: 'confirmed',
		origin: 'online',
		accessToken: `atk-bilan-${Date.now()}-${seq}`,
		expiresAt: new Date(Date.now() + 15 * 60 * 1000),
	});
}

describe('getPastEventsBilan', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('lists past Events newest first, excludes upcoming ones and honours the period', async () => {
		const { getPastEventsBilan } = await import('../../src/lib/server/services/attendance');
		const now = new Date('2025-06-15T12:00:00Z');

		// Past, two Seatings: one filled lunch, one dinner without capacity.
		const recent = await seedEvent("Table d'été");
		const recentLunch = await seedSeating(recent.id, '2025-06-11T12:00:00Z', '2025-06-11T13:15:00Z');
		await seedSeating(recent.id, '2025-06-12T19:00:00Z', '2025-06-12T21:00:00Z', null);
		await seedReservation(recentLunch.id, 4);
		await seedReservation(recentLunch.id, 6);

		// Older past Event, beyond 3 months but within 'tout' and 12 months.
		const old = await seedEvent("Table d'hiver");
		await seedSeating(old.id, '2025-01-10T19:00:00Z', '2025-01-10T21:00:00Z');

		// Upcoming Event: its last Seating hasn't ended, so it never appears.
		const upcoming = await seedEvent('Table future');
		await seedSeating(upcoming.id, '2099-06-10T19:00:00Z', '2099-06-10T21:00:00Z');

		const all = await getPastEventsBilan('tout', now);
		expect(all.map((e) => e.titleFr)).toEqual(["Table d'été", "Table d'hiver"]);

		const recentRow = all[0];
		expect(recentRow.id).toBe(recent.id);
		expect(recentRow.lastSeatingEnd.getTime()).toBe(new Date('2025-06-12T21:00:00Z').getTime());
		expect(recentRow.seatings).toHaveLength(2);
		const lunch = recentRow.seatings[0];
		expect(lunch.date).toBe('2025-06-11');
		expect(lunch.kind).toBe('lunch');
		expect(lunch.booked).toBe(10);
		expect(lunch.noShows).toBe(10);
		expect(lunch.totalCapacity).toBe(40);
		expect(recentRow.seatings[1].totalCapacity).toBeNull();
		expect(recentRow.money).toEqual([]);

		// The 3-month window keeps the June Event, drops the January one.
		const threeMonths = await getPastEventsBilan('3m', now);
		expect(threeMonths.map((e) => e.titleFr)).toEqual(["Table d'été"]);

		// 12 months keeps both.
		const twelveMonths = await getPastEventsBilan('12m', now);
		expect(twelveMonths.map((e) => e.titleFr)).toEqual(["Table d'été", "Table d'hiver"]);
	});
});

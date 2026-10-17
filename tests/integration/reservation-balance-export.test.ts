// @vitest-environment node
/**
 * Issue 024 — Balance due on admin reservations.
 *
 * The reservation CSV export can be narrowed to one Seating and carries the
 * Deposit paid and the Balance due, so whoever runs the door can print the
 * list of what to collect. Cancelled bookings never show a Balance to collect.
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

async function seedEventWithTwoSeatings() {
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
			published: true,
			depositType: 'fixed',
			depositValue: 2000,
		})
		.returning();

	const seating = async (start: string, end: string) => {
		const startTime = new Date(start);
		const endTime = new Date(end);
		const [row] = await testDb
			.insert(eventSessions)
			.values({
				eventId: event.id,
				serviceId: await seedServiceForSession(testDb, event.id, startTime, endTime, { priceAmount: 6500 }),
				startTime,
				endTime,
				totalCapacity: 40,
				availableCapacity: 40,
				published: true,
			})
			.returning();
		return row;
	};

	const lunch = await seating('2099-06-10T12:00:00Z', '2099-06-10T13:15:00Z');
	const dinner = await seating('2099-06-10T19:00:00Z', '2099-06-10T21:00:00Z');
	return { event, lunch, dinner };
}

let seq = 0;
async function seedReservation(
	sessionId: string,
	values: {
		guestName: string;
		status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
		totalAmount: number;
		depositAmount: number;
		isComp?: boolean;
	}
) {
	seq += 1;
	await testDb.insert(reservations).values({
		eventSessionId: sessionId,
		guestEmail: `guest${seq}@example.com`,
		guestName: values.guestName,
		quantity: 2,
		totalAmount: values.totalAmount,
		depositAmount: values.depositAmount,
		balanceAmount: values.totalAmount - values.depositAmount,
		currency: 'EUR',
		status: values.status,
		isComp: values.isComp ?? false,
		accessToken: `atk-balance-${Date.now()}-${seq}`,
		expiresAt: new Date(Date.now() + 15 * 60 * 1000),
	});
}

/** Parse the CSV into header-keyed rows (no quoted commas in this fixture). */
function parse(csv: string): Record<string, string>[] {
	const [header, ...lines] = csv.split('\n');
	const keys = header.split(',');
	return lines.map((line) => {
		const cells = line.split(',');
		return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? '']));
	});
}

describe('reservation export — Seating filter and Balance due', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('exports only the chosen Seating, with Deposit paid and Balance due per Reservation', async () => {
		const { lunch, dinner } = await seedEventWithTwoSeatings();
		await seedReservation(dinner.id, { guestName: 'Alice', status: 'confirmed', totalAmount: 13000, depositAmount: 4000 });
		await seedReservation(dinner.id, { guestName: 'Comp Guest', status: 'confirmed', totalAmount: 0, depositAmount: 0, isComp: true });
		await seedReservation(dinner.id, { guestName: 'Cancelled Carl', status: 'cancelled', totalAmount: 13000, depositAmount: 4000 });
		await seedReservation(lunch.id, { guestName: 'Lunch Lou', status: 'confirmed', totalAmount: 6500, depositAmount: 2000 });

		const { exportReservationsToCSV } = await import('../../src/lib/server/services/export');
		const rows = parse(await exportReservationsToCSV({ seatingId: dinner.id }));
		const byName = Object.fromEntries(rows.map((r) => [r['Guest Name'], r]));

		expect(Object.keys(byName).sort()).toEqual(['Alice', 'Cancelled Carl', 'Comp Guest']);

		expect(byName['Alice']['Total Amount']).toBe('130');
		expect(byName['Alice']['Deposit Paid']).toBe('40');
		expect(byName['Alice']['Balance Due']).toBe('90');

		// Comp Reservations show a zero Balance.
		expect(byName['Comp Guest']['Balance Due']).toBe('0');

		// Cancelled: nothing to collect at the door, whatever was stored.
		expect(byName['Cancelled Carl']['Balance Due']).toBe('');
	});

	it('combines the Seating filter with the status filter', async () => {
		const { lunch, dinner } = await seedEventWithTwoSeatings();
		await seedReservation(dinner.id, { guestName: 'Alice', status: 'confirmed', totalAmount: 13000, depositAmount: 4000 });
		await seedReservation(dinner.id, { guestName: 'Cancelled Carl', status: 'cancelled', totalAmount: 13000, depositAmount: 4000 });
		await seedReservation(lunch.id, { guestName: 'Lunch Lou', status: 'confirmed', totalAmount: 6500, depositAmount: 2000 });

		const { exportReservationsToCSV } = await import('../../src/lib/server/services/export');
		const rows = parse(await exportReservationsToCSV({ seatingId: dinner.id, status: 'confirmed' }));
		expect(rows.map((r) => r['Guest Name'])).toEqual(['Alice']);

		const all = parse(await exportReservationsToCSV({}));
		expect(all.map((r) => r['Guest Name']).sort()).toEqual(['Alice', 'Cancelled Carl', 'Lunch Lou']);
	});
});

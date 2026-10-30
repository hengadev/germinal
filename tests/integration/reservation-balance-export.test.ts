// @vitest-environment node
/**
 * Issue 024 — Balance due on admin reservations.
 *
 * The reservation CSV export can be narrowed to one Seating and carries the
 * Deposit paid and the Balance due, so whoever runs the door can print the
 * list of what to collect. Cancelled bookings never show a Balance to collect.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations, checkIns, users } from '../../src/lib/server/db/schema';
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
			visibility: 'public',
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
		origin?: 'online' | 'staff' | 'walk_in';
		balanceSettledAt?: Date | null;
		balanceSettledBy?: string | null;
	}
) {
	seq += 1;
	const [row] = await testDb.insert(reservations).values({
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
		origin: values.origin ?? 'online',
		balanceSettledAt: values.balanceSettledAt ?? null,
		balanceSettledBy: values.balanceSettledBy ?? null,
		accessToken: `atk-balance-${Date.now()}-${seq}`,
		expiresAt: new Date(Date.now() + 15 * 60 * 1000),
	}).returning();
	return row;
}

/** Parse the CSV into header-keyed rows (quoted cells may contain commas). */
function parse(csv: string): Record<string, string>[] {
	const lines = csv.split('\n');
	const split = (line: string): string[] => {
		const cells: string[] = [];
		let current = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (inQuotes) {
				if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
				else if (c === '"') inQuotes = false;
				else current += c;
			} else if (c === '"') inQuotes = true;
			else if (c === ',') { cells.push(current); current = ''; }
			else current += c;
		}
		cells.push(current);
		return cells;
	};
	const keys = split(lines[0]);
	return lines.slice(1).map((line) => {
		const cells = split(line);
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

describe('reservation export — arrivals, settled Balance and origin', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('exports arrived guests (undone Check-ins excluded), no-shows only once the Seating is over, and the settlement and origin', async () => {
		const { event } = await seedEventWithTwoSeatings();
		// One Seating already over (past end time), one still to come.
		const pastStart = new Date(Date.now() - 3 * 60 * 60 * 1000);
		const pastEnd = new Date(Date.now() - 60 * 60 * 1000);
		const [past] = await testDb
			.insert(eventSessions)
			.values({
				eventId: event.id,
				serviceId: await seedServiceForSession(testDb, event.id, pastStart, pastEnd, { priceAmount: 6500 }),
				startTime: pastStart,
				endTime: pastEnd,
				totalCapacity: 40,
				availableCapacity: 40,
				published: true,
			})
			.returning();
		const futureStart = new Date('2099-06-10T12:00:00Z');
		const futureEnd = new Date('2099-06-10T13:15:00Z');
		const [future] = await testDb
			.insert(eventSessions)
			.values({
				eventId: event.id,
				serviceId: await seedServiceForSession(testDb, event.id, futureStart, futureEnd, { priceAmount: 6500 }),
				startTime: futureStart,
				endTime: futureEnd,
				totalCapacity: 40,
				availableCapacity: 40,
				published: true,
			})
			.returning();

		const [settler] = await testDb
			.insert(users)
			.values({ email: `settler-${crypto.randomUUID()}@example.com`, firstName: 'Jean', lastName: 'Porte', passwordHash: 'x', role: 'staff' })
			.returning();

		const alice = await seedReservation(future.id, { guestName: 'Alice', status: 'confirmed', totalAmount: 13000, depositAmount: 4000 });
		const bob = await seedReservation(past.id, { guestName: 'Bob', status: 'confirmed', totalAmount: 6500, depositAmount: 2000, balanceSettledAt: new Date(), balanceSettledBy: settler.id });
		await seedReservation(future.id, { guestName: 'Comp Guest', status: 'confirmed', totalAmount: 0, depositAmount: 0, isComp: true });
		await seedReservation(past.id, { guestName: 'Wanda', status: 'confirmed', totalAmount: 6500, depositAmount: 2000, origin: 'walk_in' });

		// Alice: one Check-in kept (1 guest), one undone (2 guests) — undone ones don't count.
		await testDb.insert(checkIns).values([
			{ reservationId: alice.id, guests: 2, method: 'manual', checkedInBy: settler.id, undoneAt: new Date(), undoneBy: settler.id },
			{ reservationId: alice.id, guests: 1, method: 'scan', checkedInBy: settler.id },
			// Bob: everyone came, and the Balance was settled.
			{ reservationId: bob.id, guests: 2, method: 'scan', checkedInBy: settler.id },
		]);

		const { exportReservationsToCSV } = await import('../../src/lib/server/services/export');
		const rows = parse(await exportReservationsToCSV({}));
		const byName = Object.fromEntries(rows.map((r) => [r['Guest Name'], r]));

		// Future Seating: arrivals count, no-shows stay empty.
		expect(byName['Alice']['Guests Arrived']).toBe('1');
		expect(byName['Alice']['No-shows']).toBe('');
		expect(byName['Alice']['Balance Settled']).toBe('no');
		expect(byName['Alice']['Balance Settled At']).toBe('');
		expect(byName['Alice']['Balance Settled By']).toBe('');
		expect(byName['Alice']['Origin']).toBe('online');

		// Past Seating: everyone arrived, so no no-shows, and the settlement is attributed.
		expect(byName['Bob']['Guests Arrived']).toBe('2');
		expect(byName['Bob']['No-shows']).toBe('0');
		expect(byName['Bob']['Balance Settled']).toBe('yes');
		expect(byName['Bob']['Balance Settled At']).not.toBe('');
		expect(byName['Bob']['Balance Settled By']).toBe('Jean Porte');
		expect(byName['Bob']['Origin']).toBe('online');

		expect(byName['Comp Guest']['Origin']).toBe('comp');
		expect(byName['Wanda']['Origin']).toBe('walk_in');
		// No Check-in at all: everyone is a no-show once the Seating is over.
		expect(byName['Wanda']['No-shows']).toBe('2');
	});
});

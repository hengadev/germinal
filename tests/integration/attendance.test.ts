// @vitest-environment node
/**
 * Issue 024 — each Seating's attendance once the Event is over.
 *
 * Booked, arrived, No-shows, Walk-ins and Comps per Seating, with Event
 * totals. Partial arrivals split between arrived and No-shows, undone
 * Check-ins never count, cancelled Reservations are ignored.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations, checkIns } from '../../src/lib/server/db/schema';
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
		quantity: number;
		status?: 'pending' | 'confirmed' | 'cancelled' | 'expired';
		isComp?: boolean;
		origin?: 'online' | 'staff' | 'walk_in';
	}
) {
	seq += 1;
	const [row] = await testDb.insert(reservations).values({
		eventSessionId: sessionId,
		guestEmail: values.origin === 'walk_in' ? null : `guest${seq}@example.com`,
		guestName: values.guestName,
		quantity: values.quantity,
		totalAmount: 0,
		depositAmount: 0,
		balanceAmount: 0,
		currency: 'EUR',
		status: values.status ?? 'confirmed',
		isComp: values.isComp ?? false,
		origin: values.origin ?? 'online',
		accessToken: `atk-attendance-${Date.now()}-${seq}`,
		expiresAt: new Date(Date.now() + 15 * 60 * 1000),
	}).returning();
	return row;
}

async function seedCheckIn(reservationId: string, guests: number, undone = false) {
	await testDb.insert(checkIns).values({
		reservationId,
		guests,
		method: 'manual',
		undoneAt: undone ? new Date() : null,
	});
}

describe('attendance', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('counts partial arrivals, undone Check-ins, Walk-ins, Comps and totals across Seatings', async () => {
		const { event, lunch, dinner } = await seedEventWithTwoSeatings();

		// Lunch: party of 4 with 3 in — 3 arrived, 1 No-show.
		const four = await seedReservation(lunch.id, { guestName: 'Party of four', quantity: 4 });
		await seedCheckIn(four.id, 2);
		await seedCheckIn(four.id, 1);

		// An undone Check-in never counts.
		const undone = await seedReservation(lunch.id, { guestName: 'Undone', quantity: 2 });
		await seedCheckIn(undone.id, 2, true);

		// A Walk-in and a Comp count in their own columns, not as No-shows.
		await seedReservation(lunch.id, { guestName: 'Walk-in', quantity: 3, origin: 'walk_in' });
		await seedCheckIn((await seedReservation(lunch.id, { guestName: 'Comp', quantity: 2, isComp: true })).id, 2);

		// A cancelled Reservation is ignored everywhere.
		const cancelled = await seedReservation(lunch.id, { guestName: 'Cancelled', quantity: 5, status: 'cancelled' });
		await seedCheckIn(cancelled.id, 5);

		// Dinner: a plain confirmed party of 2, none in.
		await seedReservation(dinner.id, { guestName: 'No-shows', quantity: 2 });

		const { getEventAttendance } = await import('../../src/lib/server/services/attendance');
		const attendance = await getEventAttendance(event.id);

		expect(attendance.days).toHaveLength(1);
		const day = attendance.days[0];
		expect(day.date).toBe('2099-06-10');
		// One lunch and one dinner Service (each with one Seating), lunch first.
		expect(day.services.map((s) => s.kind)).toEqual(['lunch', 'dinner']);

		const lunchSeating = day.services[0].seatings[0];
		expect(lunchSeating.booked).toBe(6); // party of four + the undone party
		expect(lunchSeating.arrived).toBe(5); // 3 of the party of four + the Comp's 2
		expect(lunchSeating.noShows).toBe(3); // 1 from the party of four, 2 undone
		expect(lunchSeating.walkIns).toEqual({ parties: 1, guests: 3 });
		expect(lunchSeating.comps).toEqual({ parties: 1, guests: 2 });

		const dinnerSeating = day.services[1].seatings[0];
		expect(dinnerSeating.booked).toBe(2);
		expect(dinnerSeating.arrived).toBe(0);
		expect(dinnerSeating.noShows).toBe(2);
		expect(dinnerSeating.walkIns).toEqual({ parties: 0, guests: 0 });
		expect(dinnerSeating.comps).toEqual({ parties: 0, guests: 0 });

		expect(attendance.totals).toEqual({
			booked: 8,
			arrived: 5,
			noShows: 5,
			walkIns: { parties: 1, guests: 3 },
			comps: { parties: 1, guests: 2 },
		});
	});

	it('isEventOver flips at the last Seating end time, and never without Seatings', async () => {
		const { isEventOver } = await import('../../src/lib/server/services/attendance');
		const end = new Date('2099-06-10T21:00:00Z');
		expect(isEventOver(end, new Date('2099-06-10T20:59:59Z'))).toBe(false);
		expect(isEventOver(end, new Date('2099-06-10T21:00:00Z'))).toBe(true);
		expect(isEventOver(end, new Date('2099-06-11T00:00:00Z'))).toBe(true);
		expect(isEventOver(null, new Date())).toBe(false);
	});
});

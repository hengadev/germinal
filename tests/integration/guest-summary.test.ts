// @vitest-environment node
/**
 * Issue 049 — Guest summaries for the Admin's « Clients » page.
 *
 * Guests are grouped by normalised email; no-email and anonymised
 * Reservations are excluded; visits and No-shows only count Seatings
 * that are over, upcoming Reservations are counted apart; amounts are
 * net of refunds and kept per currency; search and sort work.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventSessions, reservations, checkIns, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';
// The service pulls in the db module, mocked below with the test pool;
// it must be resolved lazily, after the mock's constants exist.
async function listGuests(params: Parameters<typeof import('../../src/lib/server/services/guest-summary')['listGuests']>[0]) {
	const { listGuests } = await import('../../src/lib/server/services/guest-summary');
	return listGuests(params);
}
async function getGuest(key: string) {
	const { getGuest } = await import('../../src/lib/server/services/guest-summary');
	return getGuest(key);
}

import { guestKeyFromEmail } from '../../src/lib/utils/guest-email';

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

async function seedEvent() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Clients Table',
			titleFr: 'Table clients',
			descriptionEn: 'd',
			descriptionFr: 'd',
			startDate: new Date('2024-06-10'),
			endDate: new Date('2024-06-11'),
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

	// One Seating long over, one far in the future.
	const past = await seating('2024-06-10T19:00:00Z', '2024-06-10T21:00:00Z');
	const future = await seating('2099-06-10T19:00:00Z', '2099-06-10T21:00:00Z');
	return { event, past, future };
}

async function seedReservation(
	sessionId: string,
	values: {
		guestEmail?: string | null;
		guestName: string;
		quantity: number;
		status?: 'pending' | 'confirmed' | 'cancelled' | 'expired';
		isComp?: boolean;
		origin?: 'online' | 'staff' | 'walk_in';
		currency?: string;
	}
) {
	seq += 1;
	const [row] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail: values.guestEmail ?? null,
			guestName: values.guestName,
			quantity: values.quantity,
			totalAmount: 6500,
			depositAmount: 6500,
			balanceAmount: 0,
			currency: values.currency ?? 'EUR',
			status: values.status ?? 'confirmed',
			isComp: values.isComp ?? false,
			origin: values.origin ?? 'online',
			accessToken: `atk-clients-${Date.now()}-${seq}`,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
		})
		.returning();
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

async function seedPayment(
	reservationId: string,
	amount: number,
	currency = 'EUR',
	refunded = 0
) {
	seq += 1;
	await testDb.insert(payments).values({
		reservationId,
		stripePaymentIntentId: `pi-clients-${Date.now()}-${seq}`,
		amount,
		currency,
		status: refunded >= amount ? 'refunded' : refunded > 0 ? 'partially_refunded' : 'succeeded',
		refundedAmount: refunded,
		idempotencyKey: `idem-clients-${Date.now()}-${seq}`,
	});
}

describe('guest summary', () => {
	beforeEach(async () => {
		await setupTestDatabase();
	});

	it('groups emails differing only in case or spaces into one Guest, and excludes no-email and anonymised Reservations', async () => {
		const { past } = await seedEvent();
		await seedReservation(past.id, { guestEmail: '  Alice@Example.com ', guestName: 'Alice One', quantity: 2 });
		await seedReservation(past.id, { guestEmail: 'alice@example.com', guestName: 'Alice Two', quantity: 3 });
		// Walk-in without email, Comp without email, anonymised.
		await seedReservation(past.id, { guestEmail: null, guestName: 'Walk-in', quantity: 2, origin: 'walk_in' });
		await seedReservation(past.id, { guestEmail: null, guestName: 'Comp', quantity: 2, isComp: true });
		await seedReservation(past.id, { guestEmail: 'anonymised@invalid', guestName: 'Erased', quantity: 2 });

		const { guests, total } = await listGuests({});
		expect(total).toBe(1);
		expect(guests).toHaveLength(1);
		expect(guests[0].email).toBe('alice@example.com');
		// The most recent Reservation's name (later seating end wins; both same
		// seating, so the later-created one).
		expect(guests[0].name).toBe('Alice Two');
		expect(guests[0].visits).toBe(2);
	});

	it('counts visits, arrivals and No-shows only on Seatings that are over, and upcoming apart', async () => {
		const { past, future } = await seedEvent();
		// Past: party of 4, 3 in — 1 No-show. Second past visit fully arrived.
		const four = await seedReservation(past.id, { guestEmail: 'bob@example.com', guestName: 'Bob', quantity: 4 });
		await seedCheckIn(four.id, 2);
		await seedCheckIn(four.id, 1);
		await seedCheckIn(four.id, 5, true); // undone, never counts
		const two = await seedReservation(past.id, { guestEmail: 'bob@example.com', guestName: 'Bob', quantity: 2 });
		await seedCheckIn(two.id, 2);
		// Future: counted as upcoming, not as a visit or No-show.
		const upcoming = await seedReservation(future.id, { guestEmail: 'bob@example.com', guestName: 'Bob', quantity: 3 });
		await seedCheckIn(upcoming.id, 3);
		// Cancelled past reservation: never counted.
		await seedReservation(past.id, { guestEmail: 'bob@example.com', guestName: 'Bob', quantity: 5, status: 'cancelled' });

		const [bob] = (await listGuests({})).guests;
		expect(bob.visits).toBe(2);
		expect(bob.guestsArrived).toBe(5);
		expect(bob.noShows).toBe(1);
		expect(bob.upcoming).toBe(1);
		expect(bob.lastVisit).not.toBeNull();
	});

	it('keeps amounts net of refunds and per currency', async () => {
		const { past } = await seedEvent();
		const eur = await seedReservation(past.id, { guestEmail: 'carol@example.com', guestName: 'Carol', quantity: 2, currency: 'EUR' });
		await seedPayment(eur.id, 5000, 'EUR');
		await seedPayment(eur.id, 2000, 'EUR', 1500); // 500 net
		const usd = await seedReservation(past.id, { guestEmail: 'carol@example.com', guestName: 'Carol', quantity: 2, currency: 'USD' });
		await seedPayment(usd.id, 3000, 'USD', 3000); // fully refunded
		// A pending payment never counts.
		const pendingRow = await seedReservation(past.id, { guestEmail: 'carol@example.com', guestName: 'Carol', quantity: 1, currency: 'CHF' });
		await testDb.insert(payments).values({
			reservationId: pendingRow.id,
			stripePaymentIntentId: `pi-pending-${Date.now()}`,
			amount: 900,
			currency: 'CHF',
			status: 'pending',
			idempotencyKey: `idem-pending-${Date.now()}`,
		});

		const [carol] = (await listGuests({})).guests;
		const eurAmount = carol.amounts.find((a) => a.currency === 'EUR');
		const usdAmount = carol.amounts.find((a) => a.currency === 'USD');
		expect(eurAmount?.net).toBe(5500);
		expect(usdAmount?.net).toBe(0);
		expect(carol.amounts.find((a) => a.currency === 'CHF')).toBeUndefined();
	});

	it('searches by email and by name without changing the aggregates', async () => {
		const { past } = await seedEvent();
		await seedReservation(past.id, { guestEmail: 'dana@example.com', guestName: 'Dana Doe', quantity: 2 });
		await seedReservation(past.id, { guestEmail: 'dana@example.com', guestName: 'Dana Smith', quantity: 3 });
		await seedReservation(past.id, { guestEmail: 'erin@example.com', guestName: 'Erin', quantity: 1 });

		const byEmail = await listGuests({ search: 'DANA@EXAMPLE' });
		expect(byEmail.total).toBe(1);
		expect(byEmail.guests[0].visits).toBe(2);

		const byName = await listGuests({ search: 'Dana Smith' });
		expect(byName.total).toBe(1);
		expect(byName.guests[0].visits).toBe(2);
	});

	it('sorts by visits and by net amount, and paginates', async () => {
		const { past } = await seedEvent();
		const a = await seedReservation(past.id, { guestEmail: 'a@example.com', guestName: 'A', quantity: 2 });
		const b = await seedReservation(past.id, { guestEmail: 'b@example.com', guestName: 'B', quantity: 2 });
		await seedReservation(past.id, { guestEmail: 'b@example.com', guestName: 'B', quantity: 2 });
		const c = await seedReservation(past.id, { guestEmail: 'c@example.com', guestName: 'C', quantity: 2 });
		await seedPayment(a.id, 10000, 'EUR');
		await seedPayment(b.id, 100, 'EUR');
		await seedPayment(c.id, 5000, 'EUR');

		const byVisits = await listGuests({ sort: 'visits' });
		expect(byVisits.guests[0].email).toBe('b@example.com');

		const byAmount = await listGuests({ sort: 'amount' });
		expect(byAmount.guests.map((g) => g.email)).toEqual(['a@example.com', 'c@example.com', 'b@example.com']);

		const page1 = await listGuests({ pageSize: 2 });
		expect(page1.pageCount).toBe(2);
		expect(page1.guests).toHaveLength(2);
		const page2 = await listGuests({ pageSize: 2, page: 2 });
		expect(page2.guests).toHaveLength(1);
	});

	it('returns one Guest history by URL-safe key, with no raw email in the key', async () => {
		const { past, future } = await seedEvent();
		const r1 = await seedReservation(past.id, { guestEmail: 'Frank@Example.com', guestName: 'Frank', quantity: 4 });
		await seedCheckIn(r1.id, 3);
		await seedPayment(r1.id, 6500, 'EUR');
		await seedReservation(future.id, { guestEmail: 'frank@example.com', guestName: 'Frank', quantity: 2 });

		const key = guestKeyFromEmail('frank@example.com');
		expect(key).not.toBeNull();
		expect(key).not.toContain('frank');
		expect(key).toBe(guestKeyFromEmail(' Frank@EXAMPLE.com '));

		const detail = await getGuest(key!);
		expect(detail).not.toBeNull();
		expect(detail!.email).toBe('frank@example.com');
		expect(detail!.visits).toBe(1);
		expect(detail!.noShows).toBe(1);
		expect(detail!.upcoming).toBe(1);
		expect(detail!.amounts).toEqual([{ currency: 'EUR', net: 6500 }]);
		expect(detail!.reservations).toHaveLength(2);
		// Most recent Seating first.
		expect(new Date(detail!.reservations[0].seatingStart).getTime()).toBeGreaterThan(
			new Date(detail!.reservations[1].seatingStart).getTime()
		);
		expect(detail!.reservations[1].guestsArrived).toBe(3);
		expect(detail!.reservations[1].net).toBe(6500);
		expect(detail!.reservations[0].net).toBe(0);

		expect(await getGuest('not base64!!')).toBeNull();
		expect(await getGuest(guestKeyFromEmail('unknown@example.com')!)).toBeNull();
	});
});

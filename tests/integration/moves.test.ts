// @vitest-environment node
/**
 * Issue 022 — Move a Reservation to another Seating of its Service on the
 * same Day: the Token, Check-ins and Balance are untouched, capacity moves
 * (floored at 0 on the target), any other Service or Day is refused, the
 * Move needs the permission, and the guest is emailed only when they have
 * an address.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	checkIns,
	events,
	eventDays,
	eventServices,
	eventSessions,
	reservations,
	users,
} from '../../src/lib/server/db/schema';
import { dayOf } from '../../src/lib/utils/event-time';
import { staffAccess, type StaffWho } from '../../src/lib/staff/access';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
}));

// Email mocked at the service boundary (prior art: checkout-confirmation.test.ts).
const sendReservationModifiedEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/server/services/email', () => ({
	sendReservationModifiedEmail: sendReservationModifiedEmailMock,
}));

beforeEach(async () => {
	await setupTestDatabase();
	sendReservationModifiedEmailMock.mockClear();
});

afterAll(async () => {
	await closeTestDatabase();
});

const ZONE = 'Europe/Paris';

function accessFor(who: StaffWho, dates: string[], now: Date) {
	return staffAccess(who, dates, ZONE, now);
}

/**
 * An Event with one Day, a dinner Service with two Seatings, a lunch
 * Service with one Seating, and another Day with its own dinner Service.
 */
async function seed(now: Date) {
	const today = dayOf(now, ZONE);
	const tomorrow = dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE);
	const [actor] = await testDb
		.insert(users)
		.values({
			email: `actor-${crypto.randomUUID()}@example.com`,
			firstName: 'Jean',
			lastName: 'Porte',
			passwordHash: 'x',
			role: 'staff',
		})
		.returning();
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startDate: new Date(`${today}T12:00:00Z`),
			endDate: new Date(`${tomorrow}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE,
		})
		.returning();
	const [day] = await testDb.insert(eventDays).values({ eventId: event.id, date: today }).returning();
	const [otherDay] = await testDb
		.insert(eventDays)
		.values({ eventId: event.id, date: tomorrow })
		.returning();
	const [dinner] = await testDb
		.insert(eventServices)
		.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [lunch] = await testDb
		.insert(eventServices)
		.values({ dayId: day.id, kind: 'lunch', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [dinnerTomorrow] = await testDb
		.insert(eventServices)
		.values({ dayId: otherDay.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const seating = (serviceId: string, hour: string, capacity: number | null, available: number | null) =>
		testDb
			.insert(eventSessions)
			.values({
				eventId: event.id,
				serviceId,
				startTime: new Date(`${today}T${hour}:00:00Z`),
				endTime: new Date(`${today}T${String(Number(hour) + 2).padStart(2, '0')}:00:00Z`),
				totalCapacity: capacity,
				availableCapacity: available,
			})
			.returning();
	const [early] = await seating(dinner.id, '19', 10, 6);
	const [late] = await seating(dinner.id, '21', 4, 2);
	const [noon] = await seating(lunch.id, '12', 20, 20);
	const [nextDay] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: dinnerTomorrow.id,
			startTime: new Date(`${tomorrow}T19:00:00Z`),
			endTime: new Date(`${tomorrow}T21:00:00Z`),
		})
		.returning();

	async function reservation(name: string, opts: { email?: string | null; quantity?: number } = {}) {
		const [row] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: early.id,
				guestEmail: 'email' in opts ? opts.email! : `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
				guestName: name,
				quantity: opts.quantity ?? 4,
				totalAmount: 2500 * 4,
				depositAmount: 2500 * 4 - 2000,
				balanceAmount: 2000,
				currency: 'EUR',
				status: 'confirmed',
				accessToken: crypto.randomUUID().replace(/-/g, ''),
				expiresAt: new Date(now.getTime() + 3600 * 1000),
			})
			.returning();
		return row;
	}

	return { event, early, late, noon, nextDay, actor, today, reservation };
}

const svc = () => import('../../src/lib/server/services/moves');

describe('moveReservation', () => {
	it('moves within the Service, keeping token, check-ins and balance, and attributing the Move', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Alice Martin');
		await testDb.insert(checkIns).values({
			reservationId: party.id,
			guests: 2,
			method: 'manual',
			checkedInBy: s.actor.id,
		});

		const result = await (await svc()).moveReservation({
			access: accessFor({ kind: 'admin' }, [s.today], now),
			eventId: s.event.id,
			reservationId: party.id,
			toSeatingId: s.late.id,
			actorId: s.actor.id,
		});
		expect(result).toEqual({ ok: true });

		const [row] = await testDb.select().from(reservations).where(eq(reservations.id, party.id));
		expect(row.eventSessionId).toBe(s.late.id);
		// The Ticket keeps working; money and arrivals are untouched.
		expect(row.accessToken).toBe(party.accessToken);
		expect(row.balanceAmount).toBe(2000);
		expect(row.balanceSettledAt).toBeNull();
		expect(row.lastMovedAt).not.toBeNull();
		expect(row.lastMovedBy).toBe(s.actor.id);
		const [checkIn] = await testDb.select().from(checkIns);
		expect(checkIn).toBeDefined();
		expect(checkIn.undoneAt).toBeNull();

		// Capacity: released on the old Seating (capped at its total), taken
		// on the new one — floored at 0 when the party exceeds what's left.
		const [oldRow] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, s.early.id));
		const [newRow] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, s.late.id));
		expect(oldRow.availableCapacity).toBe(10);
		expect(newRow.availableCapacity).toBe(0);

		// The email carries the new Seating's time.
		expect(sendReservationModifiedEmailMock).toHaveBeenCalledTimes(1);
		expect(sendReservationModifiedEmailMock.mock.calls[0][0].sessionStartTime).toEqual(
			s.late.startTime
		);
		expect(sendReservationModifiedEmailMock.mock.calls[0][0].guestEmail).toBe(party.guestEmail);
	});

	it('never emails a guest without an address', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Sans Mail', { email: null });

		const result = await (await svc()).moveReservation({
			access: accessFor({ kind: 'admin' }, [s.today], now),
			eventId: s.event.id,
			reservationId: party.id,
			toSeatingId: s.late.id,
			actorId: s.actor.id,
		});
		expect(result).toEqual({ ok: true });
		expect(sendReservationModifiedEmailMock).not.toHaveBeenCalled();
	});

	it('refuses another Service, another Day and the same Seating', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Bob Durand');
		const admin = accessFor({ kind: 'admin' }, [s.today], now);

		for (const toSeatingId of [s.noon.id, s.nextDay.id, s.early.id]) {
			const result = await (await svc()).moveReservation({
				access: admin,
				eventId: s.event.id,
				reservationId: party.id,
				toSeatingId,
				actorId: s.actor.id,
			});
			expect(result.ok).toBe(false);
		}
		const [row] = await testDb.select().from(reservations).where(eq(reservations.id, party.id));
		expect(row.eventSessionId).toBe(s.early.id);
		expect(row.lastMovedAt).toBeNull();
	});

	it('refuses without the move permission', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Carol Nardi');

		const result = await (await svc()).moveReservation({
			access: accessFor({ kind: 'assignment', rolePermissions: ['guest_list'] }, [s.today], now),
			eventId: s.event.id,
			reservationId: party.id,
			toSeatingId: s.late.id,
			actorId: s.actor.id,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('permission');
		expect(sendReservationModifiedEmailMock).not.toHaveBeenCalled();
	});
});

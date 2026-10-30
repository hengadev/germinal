// @vitest-environment node
/**
 * Issue 017 — Check-ins by hand, and undoing one: partial arrivals sum up,
 * refusals (not confirmed, another Event, another Day, too many Guests,
 * missing permission) have French messages, concurrency never exceeds the
 * party size, and undoing keeps the row with who and when.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import {
	events,
	eventDays,
	eventServices,
	eventSessions,
	reservations,
	users,
	checkIns,
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

beforeEach(async () => {
	await setupTestDatabase();
});

afterAll(async () => {
	await closeTestDatabase();
});

const ZONE = 'Europe/Paris';

function accessFor(who: StaffWho, dates: string[], now: Date) {
	return staffAccess(who, dates, ZONE, now);
}

/** An Event with one Day, one Service and one Seating, plus an actor. */
async function seed(now: Date) {
	const today = dayOf(now, ZONE);
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
			startDate: new Date(`${today}T19:00:00Z`),
			endDate: new Date(`${today}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE,
		})
		.returning();
	const [day] = await testDb.insert(eventDays).values({ eventId: event.id, date: today }).returning();
	const [service] = await testDb
		.insert(eventServices)
		.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: service.id,
			startTime: new Date(`${today}T19:00:00Z`),
			endTime: new Date(`${today}T21:00:00Z`),
		})
		.returning();

	async function reservation(
		name: string,
		opts: { quantity?: number; status?: 'pending' | 'confirmed' | 'cancelled' } = {}
	) {
		const quantity = opts.quantity ?? 4;
		const [row] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: seating.id,
				guestEmail: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
				guestName: name,
				quantity,
				totalAmount: 2500 * quantity,
				depositAmount: 2500 * quantity,
				balanceAmount: 0,
				currency: 'EUR',
				status: opts.status ?? 'confirmed',
				accessToken: crypto.randomUUID().replace(/-/g, ''),
				expiresAt: new Date(now.getTime() + 3600 * 1000),
			})
			.returning();
		return row;
	}

	return { event, seating, actor, today, reservation };
}

const svc = () => import('../../src/lib/server/services/check-ins');

describe('check-ins', () => {
	it('checks a party in in parts: 2 then 2 reads 2/4 then 4/4', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Alice Martin', { quantity: 4 });
		const access = accessFor({ kind: 'admin' }, [s.today], now);

		const first = await (await svc()).recordCheckIn({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			guests: 2,
			method: 'manual',
			actorId: s.actor.id,
		});
		expect(first).toEqual({ ok: true, arrived: 2, quantity: 4 });

		const list = await (
			await import('../../src/lib/server/services/day-guest-list')
		).getDayGuestList(accessFor({ kind: 'assignment', rolePermissions: ['guest_list'] }, [s.today], now), s.event.id);
		expect(list!.seatings[0].parties[0].arrived).toBe(2);
		expect(list!.seatings[0].parties[0].lastCheckInAt).not.toBeNull();

		const second = await (await svc()).recordCheckIn({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			guests: 2,
			method: 'manual',
			actorId: s.actor.id,
		});
		expect(second).toEqual({ ok: true, arrived: 4, quantity: 4 });
	});

	it('refuses more Guests than still expected', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Bob Durand', { quantity: 4 });
		const access = accessFor({ kind: 'admin' }, [s.today], now);

		await (await svc()).recordCheckIn({
			access, eventId: s.event.id, reservationId: party.id, guests: 2, method: 'manual', actorId: s.actor.id,
		});
		const result = await (await svc()).recordCheckIn({
			access, eventId: s.event.id, reservationId: party.id, guests: 3, method: 'manual', actorId: s.actor.id,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('2 personnes');

		const zero = await (await svc()).recordCheckIn({
			access, eventId: s.event.id, reservationId: party.id, guests: 0, method: 'manual', actorId: s.actor.id,
		});
		expect(zero.ok).toBe(false);
	});

	it('refuses a non-confirmed Reservation', async () => {
		const now = new Date();
		const s = await seed(now);
		const pending = await s.reservation('En attente', { status: 'pending' });
		const result = await (await svc()).recordCheckIn({
			access: accessFor({ kind: 'admin' }, [s.today], now),
			eventId: s.event.id, reservationId: pending.id, guests: 1, method: 'manual', actorId: s.actor.id,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('confirmée');
	});

	it('refuses a Reservation outside the Day under way', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Hier Invité');
		// Access resolved tomorrow evening: the Seating belongs to another Day.
		const tomorrow = dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE);
		const tomorrowEvening = new Date(`${tomorrow}T20:00:00Z`);
		const access = accessFor({ kind: 'admin' }, [s.today, tomorrow], tomorrowEvening);
		const result = await (await svc()).recordCheckIn({
			access, eventId: s.event.id, reservationId: party.id, guests: 1, method: 'manual', actorId: s.actor.id,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('jour en cours');
	});

	it('refuses to undo a Check-in of another Day', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Hier Invité');
		await (await svc()).recordCheckIn({
			access: accessFor({ kind: 'admin' }, [s.today], now),
			eventId: s.event.id, reservationId: party.id, guests: 2, method: 'manual', actorId: s.actor.id,
		});
		// The next Day, yesterday's arrivals are no longer the door's to correct.
		const tomorrow = dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE);
		const access = accessFor({ kind: 'admin' }, [s.today, tomorrow], new Date(`${tomorrow}T20:00:00Z`));
		const result = await (await svc()).undoLastCheckIn({
			access, eventId: s.event.id, reservationId: party.id, actorId: s.actor.id,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('jour en cours');
		const [row] = await testDb.select().from(checkIns);
		expect(row.undoneAt).toBeNull();
	});

	it('refuses without the manual check-in permission', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Carol Nardi');
		const result = await (await svc()).recordCheckIn({
			access: accessFor({ kind: 'assignment', rolePermissions: ['guest_list'] }, [s.today], now),
			eventId: s.event.id, reservationId: party.id, guests: 1, method: 'manual', actorId: s.actor.id,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('permission');
	});

	it('two simultaneous Check-ins of 3 on a party of 4: exactly one succeeds', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Rapid Martin', { quantity: 4 });
		const access = accessFor({ kind: 'admin' }, [s.today], now);

		const results = await Promise.all(
			[1, 2].map(async () =>
				(await svc()).recordCheckIn({
					access, eventId: s.event.id, reservationId: party.id, guests: 3, method: 'manual', actorId: s.actor.id,
				})
			)
		);
		expect(results.filter((r) => r.ok).length).toBe(1);
		const [row] = await testDb.select().from(checkIns);
		expect(row.guests).toBe(3);
	});

	it('undo requires correct_mistake and keeps the row with undoneBy and undoneAt', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Dora Vernon');
		const admin = accessFor({ kind: 'admin' }, [s.today], now);
		await (await svc()).recordCheckIn({
			access: admin, eventId: s.event.id, reservationId: party.id, guests: 2, method: 'manual', actorId: s.actor.id,
		});

		// Without the permission: refused.
		const refused = await (await svc()).undoLastCheckIn({
			access: accessFor({ kind: 'assignment', rolePermissions: ['guest_list', 'manual_check_in'] }, [s.today], now),
			eventId: s.event.id, reservationId: party.id, actorId: s.actor.id,
		});
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.error).toContain('permission');

		// With it: the row stays, marked undone.
		const undone = await (await svc()).undoLastCheckIn({
			access: admin, eventId: s.event.id, reservationId: party.id, actorId: s.actor.id,
		});
		expect(undone.ok).toBe(true);
		const [row] = await testDb.select().from(checkIns);
		expect(row.guests).toBe(2);
		expect(row.undoneAt).not.toBeNull();
		expect(row.undoneBy).toBe(s.actor.id);

		// An undone Check-in stops counting.
		const list = await (
			await import('../../src/lib/server/services/day-guest-list')
		).getDayGuestList(admin, s.event.id);
		expect(list!.seatings[0].parties[0].arrived).toBe(0);

		const none = await (await svc()).undoLastCheckIn({
			access: admin, eventId: s.event.id, reservationId: party.id, actorId: s.actor.id,
		});
		expect(none.ok).toBe(false);
	});
});

// @vitest-environment node
/**
 * Issue 019 — Mark a Balance as settled, and undo it: settling records
 * who and when only (no amount, no payment method), undoing requires
 * "correct a mistake" and clears both fields, the action is refused
 * without the settle permission, parties without a Balance (comp, paid
 * 100% online) are refused, and the guest list exposes the settled fields
 * only with the guest list permission.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
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
		opts: { balance?: number; isComp?: boolean } = {}
	) {
		const balance = opts.balance ?? 2000;
		const [row] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: seating.id,
				guestEmail: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
				guestName: name,
				quantity: 4,
				totalAmount: 2500 * 4,
				depositAmount: 2500 * 4 - balance,
				balanceAmount: balance,
				currency: 'EUR',
				status: 'confirmed',
				isComp: opts.isComp ?? false,
				accessToken: crypto.randomUUID().replace(/-/g, ''),
				expiresAt: new Date(now.getTime() + 3600 * 1000),
			})
			.returning();
		return row;
	}

	return { event, seating, actor, today, reservation };
}

const svc = () => import('../../src/lib/server/services/balance');

describe('balance settled', () => {
	it('settles a Balance with who and when only', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Alice Martin');
		const access = accessFor({ kind: 'admin' }, [s.today], now);

		const result = await (await svc()).settleBalance({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});
		expect(result).toEqual({ ok: true });

		const [row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).not.toBeNull();
		expect(row.balanceSettledBy).toBe(s.actor.id);
		// The Balance itself is untouched: no amount, no method anywhere.
		expect(row.balanceAmount).toBe(2000);
	});

	it('undo requires correct_mistake and clears both fields', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Bob Durand');
		const admin = accessFor({ kind: 'admin' }, [s.today], now);
		await (await svc()).settleBalance({
			access: admin,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});

		// Without the permission: refused.
		const refused = await (await svc()).undoSettleBalance({
			access: accessFor(
				{ kind: 'assignment', rolePermissions: ['guest_list', 'settle_balance'] },
				[s.today],
				now
			),
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.error).toContain('permission');

		const undone = await (await svc()).undoSettleBalance({
			access: admin,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});
		expect(undone).toEqual({ ok: true });
		const [row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).toBeNull();
		expect(row.balanceSettledBy).toBeNull();

		// Undoing again: nothing to undo.
		const again = await (await svc()).undoSettleBalance({
			access: admin,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});
		expect(again.ok).toBe(false);
	});

	it('refuses without the settle_balance permission, and twice', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Carol Nardi');

		const refused = await (await svc()).settleBalance({
			access: accessFor({ kind: 'assignment', rolePermissions: ['guest_list'] }, [s.today], now),
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.error).toContain('permission');

		const admin = accessFor({ kind: 'admin' }, [s.today], now);
		await (await svc()).settleBalance({
			access: admin,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});
		const twice = await (await svc()).settleBalance({
			access: admin,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});
		expect(twice.ok).toBe(false);
		if (!twice.ok) expect(twice.error).toContain('déjà');
	});

	it('refuses parties without a Balance: comp and 100% paid online', async () => {
		const now = new Date();
		const s = await seed(now);
		const comp = await s.reservation('Offert Martin', { balance: 0, isComp: true });
		const paid = await s.reservation('Payé Ligne', { balance: 0 });
		const admin = accessFor({ kind: 'admin' }, [s.today], now);

		for (const party of [comp, paid]) {
			const result = await (await svc()).settleBalance({
				access: admin,
				eventId: s.event.id,
				reservationId: party.id,
				actorId: s.actor.id,
			});
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain('pas de solde');
			const [row] = await testDb
				.select()
				.from(reservations)
				.where(eq(reservations.id, party.id));
			expect(row.balanceSettledAt).toBeNull();
		}
	});

	it('the guest list exposes the settled fields only with guest_list', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Dora Vernon');
		const admin = accessFor({ kind: 'admin' }, [s.today], now);
		await (await svc()).settleBalance({
			access: admin,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
		});

		const list = await (
			await import('../../src/lib/server/services/day-guest-list')
		).getDayGuestList(admin, s.event.id);
		const listed = list!.seatings[0].parties.find((p) => p.id === party.id)!;
		expect(listed.balanceSettledAt).not.toBeNull();
		expect(listed.balanceSettledByName).toBe('Jean Porte');

		const without = await (
			await import('../../src/lib/server/services/day-guest-list')
		).getDayGuestList(
			accessFor({ kind: 'assignment', rolePermissions: ['dietary'] }, [s.today], now),
			s.event.id
		);
		const hidden = without!.seatings[0].parties[0];
		expect(hidden.balanceSettledAt).toBeUndefined();
		expect(hidden.balanceSettledByName).toBeUndefined();
	});
});

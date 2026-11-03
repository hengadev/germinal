// @vitest-environment node
//
// Issue 066 — settle a Balance with a gift card at the door: full cover
// settles, partial cover leaves the remainder open (and a second card can
// finish it), undo credits every door redemption back net of earlier
// credits, unusable codes are refused, and the settle permission is
// enforced. balanceAmount itself never changes.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	events,
	eventDays,
	eventServices,
	eventSessions,
	giftCardLedger,
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

	async function reservation(name: string, balance = 2000) {
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
				accessToken: crypto.randomUUID().replace(/-/g, ''),
				expiresAt: new Date(now.getTime() + 3600 * 1000),
			})
			.returning();
		return row;
	}

	return { event, seating, actor, today, reservation };
}

const svc = () => import('../../src/lib/server/services/balance');
const giftCards = () => import('../../src/lib/server/services/gift-cards');

async function cardFor(amount: number, opts: { expiresAt?: Date } = {}) {
	const { issueGiftCard } = await giftCards();
	return issueGiftCard({ amount, expiresAt: opts.expiresAt, origin: 'admin' });
}

describe('balance settled with a gift card', () => {
	it('a card that covers the whole Balance settles it', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Alice Martin');
		const card = await cardFor(2500);
		const access = accessFor({ kind: 'admin' }, [s.today], now);

		const result = await (await svc()).settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: card.code,
		});
		expect(result).toMatchObject({
			ok: true,
			applied: 2000,
			cardBalanceLeft: 500,
			remainder: 0,
			settled: true
		});

		const [row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).not.toBeNull();
		// The Balance itself never changes.
		expect(row.balanceAmount).toBe(2000);

		const [ledger] = await testDb.select().from(giftCardLedger);
		expect(ledger.amount).toBe(-2000);
		expect(ledger.reason).toBe('door');
		expect(ledger.reservationId).toBe(party.id);
	});

	it('a partial cover leaves the remainder open, and a second card finishes it', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Bob Durand');
		const small = await cardFor(800);
		const rest = await cardFor(5000);
		const access = accessFor({ kind: 'admin' }, [s.today], now);

		const first = await (await svc()).settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: small.code
		});
		expect(first).toMatchObject({
			ok: true,
			applied: 800,
			cardBalanceLeft: 0,
			remainder: 1200,
			settled: false
		});

		let [row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).toBeNull();
		expect(row.balanceAmount).toBe(2000);

		const second = await (await svc()).settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: rest.code
		});
		expect(second).toMatchObject({
			ok: true,
			applied: 1200,
			cardBalanceLeft: 3800,
			remainder: 0,
			settled: true
		});

		[row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).not.toBeNull();
	});

	it('undo credits every door redemption back, net of earlier credits, once', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Carol Nardi');
		const card = await cardFor(2500);
		const access = accessFor({ kind: 'admin' }, [s.today], now);
		const balance = await svc();

		await balance.settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: card.code
		});

		const undone = await balance.undoSettleBalance({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id
		});
		expect(undone).toEqual({ ok: true });

		const [row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).toBeNull();
		expect(row.balanceSettledBy).toBeNull();
		expect(row.balanceAmount).toBe(2000);

		const { getGiftCard } = await giftCards();
		expect((await getGiftCard(card.id))!.card.balance).toBe(2500);

		const rows = await testDb.select().from(giftCardLedger);
		// The credit-back is a positive 'door' row: the door rows net to 0.
		const door = rows.filter((r) => r.reason === 'door');
		expect(door.map((r) => r.amount).sort((a, b) => a - b)).toEqual([-2000, 2000]);
		expect(door.every((r) => r.reservationId === party.id)).toBe(true);

		// Undoing again: nothing left to undo, and nothing re-credited.
		const again = await balance.undoSettleBalance({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id
		});
		expect(again.ok).toBe(false);
		expect((await getGiftCard(card.id))!.card.balance).toBe(2500);

		// Settling again after the undo owes the whole Balance once more.
		const resettled = await balance.settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: card.code
		});
		expect(resettled).toMatchObject({ ok: true, applied: 2000, remainder: 0, settled: true });
		expect((await getGiftCard(card.id))!.card.balance).toBe(500);
	});

	it('refuses unusable codes', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Dora Vernon');
		const access = accessFor({ kind: 'admin' }, [s.today], now);

		const unknown = await (await svc()).settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: 'GERM-0000-0000'
		});
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) expect(unknown.error).toContain('inconnue');

		const expired = await cardFor(1000, { expiresAt: new Date(Date.now() - 1000) });
		const expiredResult = await (await svc()).settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: expired.code
		});
		expect(expiredResult.ok).toBe(false);
		if (!expiredResult.ok) expect(expiredResult.error).toContain('expirée');

		const { redeemGiftCard } = await giftCards();
		const empty = await cardFor(500);
		await redeemGiftCard(empty.code, { amount: 500, reason: 'booking' });
		const emptyResult = await (await svc()).settleBalanceWithGiftCard({
			access,
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: empty.code
		});
		expect(emptyResult.ok).toBe(false);
		if (!emptyResult.ok) expect(emptyResult.error).toContain('solde');

		const [row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).toBeNull();
		const ledger = await testDb.select().from(giftCardLedger);
		expect(ledger.filter((r) => r.reason === 'door')).toHaveLength(0);
	});

	it('refuses without the settle_balance permission', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation('Elsa Fontaine');
		const card = await cardFor(2500);

		const refused = await (await svc()).settleBalanceWithGiftCard({
			access: accessFor(
				{ kind: 'assignment', rolePermissions: ['guest_list'] },
				[s.today],
				now
			),
			eventId: s.event.id,
			reservationId: party.id,
			actorId: s.actor.id,
			code: card.code
		});
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.error).toContain('permission');

		const [row] = await testDb.select().from(reservations);
		expect(row.balanceSettledAt).toBeNull();
	});
});

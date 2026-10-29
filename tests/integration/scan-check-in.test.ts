// @vitest-environment node
/**
 * Issue 018 — Check-in by scanning the Ticket: each refusal reason shows
 * its French message and records nothing, explainTicket never touches a
 * guest field, a scan of 2 then a second scan checks in the rest, and the
 * actions refuse without the scan Check-in permission.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import {
	events,
	eventDays,
	eventServices,
	eventSessions,
	reservations,
	users,
	checkIns,
	staffRoles,
	eventStaff,
} from '../../src/lib/server/db/schema';
import { dayOf } from '../../src/lib/utils/event-time';
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

/** An Event with one Day, one Service and one Seating, plus an actor. */
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
			role: 'admin',
		})
		.returning();
	const mkEvent = async (title: string) =>
		(
			await testDb
				.insert(events)
				.values({
					titleEn: title,
					titleFr: title,
					startDate: new Date(`${today}T19:00:00Z`),
					endDate: new Date(`${today}T22:00:00Z`),
					visibility: 'public',
					timeZone: ZONE,
				})
				.returning()
		)[0];
	const event = await mkEvent('Dîner');
	const otherEvent = await mkEvent('Autre');

	async function seatingFor(eventId: string, date: string) {
		const [day] = await testDb.insert(eventDays).values({ eventId, date }).returning();
		const [service] = await testDb
			.insert(eventServices)
			.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
			.returning();
		const [seating] = await testDb
			.insert(eventSessions)
			.values({
				eventId,
				serviceId: service.id,
				startTime: new Date(`${date}T19:00:00Z`),
				endTime: new Date(`${date}T21:00:00Z`),
			})
			.returning();
		return seating;
	}
	const seating = await seatingFor(event.id, today);
	const tomorrowSeating = await seatingFor(event.id, tomorrow);
	const otherSeating = await seatingFor(otherEvent.id, today);

	async function reservation(
		seatingId: string,
		name: string,
		opts: { quantity?: number; status?: 'pending' | 'confirmed' | 'cancelled' } = {}
	) {
		const [row] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: seatingId,
				guestEmail: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
				guestName: name,
				quantity: opts.quantity ?? 4,
				totalAmount: 10000,
				depositAmount: 10000,
				balanceAmount: 0,
				currency: 'EUR',
				status: opts.status ?? 'confirmed',
				accessToken: crypto.randomUUID().replace(/-/g, ''),
				expiresAt: new Date(now.getTime() + 3600 * 1000),
			})
			.returning();
		return row;
	}

	return { event, otherEvent, tomorrowSeating, otherSeating, actor, today, seating, reservation };
}

const pageActions = () =>
	import('../../src/routes/(staff)/staff/events/[id]/+page.server').then((m) => m.actions);

function ctx(user: { id: string }, eventId: string, body: Record<string, string>) {
	return {
		request: new Request('http://x/staff/events/' + eventId, {
			method: 'POST',
			body: new URLSearchParams(body),
		}),
		locals: { user },
		params: { id: eventId },
	} as any;
}

describe('scan check-in', () => {
	it('a scan resolves the party; a scan of 2 then a second scan checks in the rest', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation(s.seating.id, 'Alice Martin', { quantity: 4 });
		const a = await pageActions();

		const first = (await a.scan(ctx(s.actor, s.event.id, { token: party.accessToken }))) as any;
		expect(isActionFailure(first)).toBe(false);
		expect(first.scan.party).toMatchObject({ guestName: 'Alice Martin', quantity: 4, arrived: 0 });

		const check2 = (await a.scanCheckIn(
			ctx(s.actor, s.event.id, { reservationId: party.id, guests: '2' })
		)) as any;
		expect(isActionFailure(check2)).toBe(false);
		expect(check2.scanCheckedIn).toEqual({ guests: 2, arrived: 2, quantity: 4 });

		// Scanning the same Ticket again later checks in the rest.
		const second = (await a.scan(ctx(s.actor, s.event.id, { token: party.accessToken }))) as any;
		expect(second.scan.party).toMatchObject({ arrived: 2, quantity: 4 });
		const checkRest = (await a.scanCheckIn(
			ctx(s.actor, s.event.id, { reservationId: party.id, guests: '2' })
		)) as any;
		expect(checkRest.scanCheckedIn).toEqual({ guests: 2, arrived: 4, quantity: 4 });

		const rows = await testDb.select().from(checkIns);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.method === 'scan')).toBe(true);

		// And now the party is complete: a new scan refuses.
		const third = (await a.scan(ctx(s.actor, s.event.id, { token: party.accessToken }))) as any;
		expect(isActionFailure(third)).toBe(true);
		expect(third.data.scanRefusal).toBe('Tout le groupe est déjà entré.');
	});

	it('each refusal reason returns its own French message and records nothing', async () => {
		const now = new Date();
		const s = await seed(now);
		const a = await pageActions();

		const unknown = (await a.scan(ctx(s.actor, s.event.id, { token: 'nope' }))) as any;
		expect(unknown.data.scanRefusal).toBe('Billet inconnu.');

		const cancelledRow = await s.reservation(s.seating.id, 'Annulé', { status: 'cancelled' });
		const cancelled = (await a.scan(ctx(s.actor, s.event.id, { token: cancelledRow.accessToken }))) as any;
		expect(cancelled.data.scanRefusal).toBe('Cette réservation est annulée.');

		const otherEventRow = await s.reservation(s.otherSeating.id, 'Ailleurs');
		const otherEvent = (await a.scan(
			ctx(s.actor, s.event.id, { token: otherEventRow.accessToken })
		)) as any;
		expect(otherEvent.data.scanRefusal).toBe('Ce billet est pour un autre événement.');

		const otherDayRow = await s.reservation(s.tomorrowSeating.id, 'Demain');
		const otherDay = (await a.scan(ctx(s.actor, s.event.id, { token: otherDayRow.accessToken }))) as any;
		expect(otherDay.data.scanRefusal).toContain('Ce billet est pour le ');

		expect(await testDb.select().from(checkIns)).toHaveLength(0);
	});

	it('explainTicket never returns a guest field', async () => {
		const now = new Date();
		const s = await seed(now);
		const row = await s.reservation(s.otherSeating.id, 'Secret Name');
		const { explainTicket } = await import('../../src/lib/server/services/day-guest-list');

		const explanation = await explainTicket(s.event.id, row.accessToken);
		expect(explanation).toEqual({ reason: 'other_event' });
		expect(JSON.stringify(explanation)).not.toContain('Secret Name');
		expect(Object.keys(explanation)).not.toContain('guestName');

		expect(await explainTicket(s.event.id, 'nope')).toEqual({ reason: 'unknown' });
	});

	it('the actions refuse without the scan Check-in permission', async () => {
		const now = new Date();
		const s = await seed(now);
		const party = await s.reservation(s.seating.id, 'Carol Nardi');
		const a = await pageActions();

		const [staffUser] = await testDb
			.insert(users)
			.values({
				email: `staff-${crypto.randomUUID()}@example.com`,
				firstName: 'Léa',
				lastName: 'Porte',
				passwordHash: 'x',
				role: 'staff',
			})
			.returning();
		const [role] = await testDb
			.insert(staffRoles)
			.values({ name: `Rôle ${crypto.randomUUID()}`, permissions: ['guest_list'] })
			.returning();
		await testDb
			.insert(eventStaff)
			.values({ eventId: s.event.id, userId: staffUser.id, staffRoleId: role.id });

		const scan = (await a.scan(ctx(staffUser, s.event.id, { token: party.accessToken }))) as any;
		expect(isActionFailure(scan)).toBe(true);
		expect(scan.status).toBe(403);
		expect(scan.data.scanRefusal).toContain('permission');

		const checkIn = (await a.scanCheckIn(
			ctx(staffUser, s.event.id, { reservationId: party.id, guests: '1' })
		)) as any;
		expect(isActionFailure(checkIn)).toBe(true);
		expect(checkIn.status).toBe(403);

		expect(await testDb.select().from(checkIns)).toHaveLength(0);
	});
});

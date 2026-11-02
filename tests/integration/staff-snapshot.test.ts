// @vitest-environment node
/**
 * Issue 060 — the Day's snapshot for the phone: permission-filtered
 * fields, each ticket code as a SHA-256 hex hash (never the code itself),
 * and the refusals (no scan or manual Check-in permission, no Day,
 * no assignment).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
	events,
	eventDays,
	eventServices,
	eventSessions,
	reservations,
	users,
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

const snapshotGet = () =>
	import('../../src/routes/(staff)/staff/events/[id]/snapshot/+server').then((m) => m.GET);

function ctx(user: { id: string } | null, eventId: string) {
	return { locals: { user }, params: { id: eventId } } as any;
}

/** An Event with one Day today (and one tomorrow), a Seating each, and reservations. */
async function seed(now: Date) {
	const today = dayOf(now, ZONE);
	const tomorrow = dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE);
	const [admin] = await testDb
		.insert(users)
		.values({
			email: `admin-${crypto.randomUUID()}@example.com`,
			firstName: 'Jean',
			lastName: 'Porte',
			passwordHash: 'x',
			role: 'admin',
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

	async function seatingFor(date: string) {
		const [day] = await testDb.insert(eventDays).values({ eventId: event.id, date }).returning();
		const [service] = await testDb
			.insert(eventServices)
			.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
			.returning();
		const [seating] = await testDb
			.insert(eventSessions)
			.values({
				eventId: event.id,
				serviceId: service.id,
				startTime: new Date(`${date}T19:00:00Z`),
				endTime: new Date(`${date}T21:00:00Z`),
			})
			.returning();
		return seating;
	}
	const seating = await seatingFor(today);
	const tomorrowSeating = await seatingFor(tomorrow);

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

	/** A Staff member assigned to the Event with the given role permissions. */
	async function staffMember(permissions: string[]) {
		const [role] = await testDb
			.insert(staffRoles)
			.values({ name: `Role ${crypto.randomUUID()}`, permissions })
			.returning();
		const [user] = await testDb
			.insert(users)
			.values({
				email: `staff-${crypto.randomUUID()}@example.com`,
				firstName: 'Staff',
				lastName: 'Test',
				passwordHash: 'x',
				role: 'staff',
			})
			.returning();
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: user.id, staffRoleId: role.id });
		return user;
	}

	return { event, seating, tomorrowSeating, admin, today, tomorrow, reservation, staffMember };
}

describe('the Day snapshot endpoint', () => {
	it('returns the Day with each party and the hash of its ticket code, never the code', async () => {
		const now = new Date();
		const s = await seed(now);
		const alice = await s.reservation(s.seating.id, 'Alice Martin', { quantity: 4 });
		await s.reservation(s.seating.id, 'Non confirmé', { status: 'pending' });
		await s.reservation(s.tomorrowSeating.id, 'Demain');

		const GET = await snapshotGet();
		const response = await GET(ctx(s.admin, s.event.id));
		expect(response.status).toBe(200);
		const snapshot = await response.json();

		expect(snapshot.day).toBe(s.today);
		expect(snapshot.takenAt).toBeTruthy();
		expect(snapshot.seatings).toHaveLength(1);
		expect(snapshot.seatings[0].id).toBe(s.seating.id);
		expect(snapshot.seatings[0].parties).toHaveLength(1);
		const party = snapshot.seatings[0].parties[0];
		expect(party).toMatchObject({ guestName: 'Alice Martin', quantity: 4, arrived: 0 });
		expect(party.tokenHash).toBe(createHash('sha256').update(alice.accessToken, 'utf8').digest('hex'));
		// The code itself never leaves the server.
		expect(JSON.stringify(snapshot)).not.toContain(alice.accessToken);
	});

	it('refuses without the scan or manual Check-in permission', async () => {
		const now = new Date();
		const s = await seed(now);
		const cook = await s.staffMember(['dietary']);
		const GET = await snapshotGet();
		await expect(GET(ctx(cook, s.event.id))).rejects.toMatchObject({ status: 403 });
		// The manual Check-in permission alone is enough.
		const door = await s.staffMember(['manual_check_in']);
		await expect(GET(ctx(door, s.event.id))).resolves.toBeTruthy();
	});

	it('refuses outside a Day and without an assignment', async () => {
		const now = new Date(new Date().setHours(12, 0, 0, 0));
		// An Event whose only Day is tomorrow: no Day is under way.
		const [event] = await testDb
			.insert(events)
			.values({
				titleEn: 'Later',
				titleFr: 'Plus tard',
				startDate: new Date(`${dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE)}T19:00:00Z`),
				endDate: new Date(`${dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE)}T22:00:00Z`),
				visibility: 'public',
				timeZone: ZONE,
			})
			.returning();
		await testDb.insert(eventDays).values({
			eventId: event.id,
			date: dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE),
		});
		const [admin] = await testDb
			.insert(users)
			.values({ email: `a-${crypto.randomUUID()}@example.com`, firstName: 'A', lastName: 'B', passwordHash: 'x', role: 'admin' })
			.returning();
		const GET = await snapshotGet();
		// A Day with no Seating yet: tomorrow's Day is not under way, but the
		// seeded event of `seed` is — use the unassigned staff member instead.
		await expect(GET(ctx(admin, event.id))).rejects.toMatchObject({ status: 403 });

		const s = await seed(now);
		const [stranger] = await testDb
			.insert(users)
			.values({ email: `x-${crypto.randomUUID()}@example.com`, firstName: 'X', lastName: 'Y', passwordHash: 'x', role: 'staff' })
			.returning();
		await expect(GET(ctx(stranger, s.event.id))).rejects.toMatchObject({ status: 403 });
		await expect(GET(ctx(null, s.event.id))).rejects.toMatchObject({ status: 401 });
	});
});

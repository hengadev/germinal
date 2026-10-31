// @vitest-environment node
/**
 * Issue 034 — scanTargetsFor lists the Events whose Day is under way and
 * where the user holds scan_check_in (Admins: every Event), for the
 * floating Scan button's overlay.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventDays, eventStaff, staffRoles, users } from '../../src/lib/server/db/schema';
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

async function seed() {
	const run = crypto.randomUUID();
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner A',
			titleFr: 'Dîner A',
			startDate: new Date('2099-06-01T19:00:00Z'),
			endDate: new Date('2099-06-01T22:00:00Z'),
			visibility: 'public',
			timeZone: ZONE,
		})
		.returning();
	const [staffUser] = await testDb
		.insert(users)
		.values({ email: `staff-${run}@example.com`, firstName: 'S', lastName: 'Taff', passwordHash: 'x', role: 'staff' })
		.returning();
	return { event, staffUser };
}

async function roleId(name: string): Promise<string> {
	const [role] = await testDb.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.name, name));
	if (!role) throw new Error(`Missing seeded role ${name}`);
	return role.id;
}

describe('scanTargetsFor', () => {
	it('lists the Event whose Day is under way, where the user may scan', async () => {
		const { event, staffUser } = await seed();
		const now = new Date();
		await testDb.insert(eventDays).values({ eventId: event.id, date: dayOf(now, ZONE) });
		const porte = await roleId('Porte'); // scan_check_in
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: porte });

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetsFor(staffUser, now)).toEqual([
			{ eventId: event.id, title: 'Dîner A' }
		]);
	});

	it('lists two Events with a Day under way, in list order', async () => {
		const { staffUser } = await seed();
		const now = new Date();
		const [eventB] = await testDb
			.insert(events)
			.values({
				titleEn: 'Dinner B',
				titleFr: 'Dîner B',
				startDate: new Date('2099-06-08T19:00:00Z'),
				endDate: new Date('2099-06-08T22:00:00Z'),
				visibility: 'public',
				timeZone: ZONE
			})
			.returning();
		const { event: eventA } = { event: (await testDb.select().from(events).where(eq(events.titleFr, 'Dîner A')))[0] };
		for (const ev of [eventA, eventB]) {
			await testDb.insert(eventDays).values({ eventId: ev.id, date: dayOf(now, ZONE) });
		}
		const porte = await roleId('Porte');
		await testDb.insert(eventStaff).values([
			{ eventId: eventA.id, userId: staffUser.id, staffRoleId: porte },
			{ eventId: eventB.id, userId: staffUser.id, staffRoleId: porte }
		]);

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetsFor(staffUser, now)).toEqual([
			{ eventId: eventA.id, title: 'Dîner A' },
			{ eventId: eventB.id, title: 'Dîner B' }
		]);
	});

	it('is empty during a Day without the scan_check_in permission', async () => {
		const { event, staffUser } = await seed();
		const now = new Date();
		await testDb.insert(eventDays).values({ eventId: event.id, date: dayOf(now, ZONE) });
		const bar = await roleId('Bar'); // tasks only
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetsFor(staffUser, now)).toEqual([]);
	});

	it('is empty with no Day under way', async () => {
		const { event, staffUser } = await seed();
		const now = new Date();
		await testDb.insert(eventDays).values({ eventId: event.id, date: '2100-01-01' });
		const porte = await roleId('Porte');
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: porte });

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetsFor(staffUser, now)).toEqual([]);
	});

	it('gives an Admin every Event with a Day under way', async () => {
		const { event, staffUser } = await seed();
		const now = new Date();
		await testDb.insert(eventDays).values({ eventId: event.id, date: dayOf(now, ZONE) });
		const [admin] = await testDb
			.insert(users)
			.values({ email: `admin-${crypto.randomUUID()}@example.com`, firstName: 'A', lastName: 'Dmin', passwordHash: 'x', role: 'admin' })
			.returning();

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetsFor(admin, now)).toEqual([
			{ eventId: event.id, title: 'Dîner A' }
		]);
		// The staff user has no assignment at all: nothing to scan.
		expect(await svc.scanTargetsFor(staffUser, now)).toEqual([]);
	});
});

// @vitest-environment node
/**
 * Issue 031 — scanTargetFor answers the Event page's Scanner tab to open
 * with one tap: the first of the user's Events whose Day is under way and
 * where they hold scan_check_in.
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

describe('scanTargetFor', () => {
	it('points at the Event whose Day is under way, where the user may scan', async () => {
		const { event, staffUser } = await seed();
		const now = new Date();
		await testDb.insert(eventDays).values({ eventId: event.id, date: dayOf(now, ZONE) });
		const porte = await roleId('Porte'); // scan_check_in
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: porte });

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetFor(staffUser, now)).toBe(`/staff/events/${event.id}?onglet=scanner`);
	});

	it('is null during a Day without the scan_check_in permission', async () => {
		const { event, staffUser } = await seed();
		const now = new Date();
		await testDb.insert(eventDays).values({ eventId: event.id, date: dayOf(now, ZONE) });
		const bar = await roleId('Bar'); // tasks only
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetFor(staffUser, now)).toBeNull();
	});

	it('is null with no Day under way', async () => {
		const { event, staffUser } = await seed();
		const now = new Date();
		await testDb.insert(eventDays).values({ eventId: event.id, date: '2100-01-01' });
		const porte = await roleId('Porte');
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: porte });

		const svc = await import('../../src/lib/server/services/staff-portal');
		expect(await svc.scanTargetFor(staffUser, now)).toBeNull();
	});
});

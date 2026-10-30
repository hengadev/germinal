// @vitest-environment node
/**
 * Issue 015 — the Staff portal's door: getStaffEventAccess and
 * listStaffEvents answer for a Staff member's Assignment (with today's
 * Day or not), refuse a Staff member without an Assignment, give an Admin
 * every Event with every permission, and the Tasks permission gates Task
 * updates.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventDays, eventStaff, staffRoles, tasks, users } from '../../src/lib/server/db/schema';
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
	const [futureEvent] = await testDb
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
	const [pastEvent] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner B',
			titleFr: 'Dîner B',
			startDate: new Date('2000-07-01T19:00:00Z'),
			endDate: new Date('2000-07-01T22:00:00Z'),
			visibility: 'public',
			timeZone: ZONE,
		})
		.returning();
	const [staffUser] = await testDb
		.insert(users)
		.values({ email: `staff-${run}@example.com`, firstName: 'S', lastName: 'Taff', passwordHash: 'x', role: 'staff' })
		.returning();
	const [adminUser] = await testDb
		.insert(users)
		.values({ email: `admin-${run}@example.com`, firstName: 'A', lastName: 'Dmin', passwordHash: 'x', role: 'admin' })
		.returning();
	return { futureEvent, pastEvent, staffUser, adminUser };
}

async function roleId(name: string): Promise<string> {
	const [role] = await testDb.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.name, name));
	if (!role) throw new Error(`Missing seeded role ${name}`);
	return role.id;
}

describe('staff portal access', () => {
	it('a Staff member with an Assignment whose Day is now lands on that Event', async () => {
		const { futureEvent, staffUser } = await seed();
		const now = new Date();
		const today = dayOf(now, ZONE);
		await testDb.insert(eventDays).values({ eventId: futureEvent.id, date: today });
		const bar = await roleId('Bar'); // ['tasks']
		await testDb.insert(eventStaff).values({ eventId: futureEvent.id, userId: staffUser.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/staff-portal');
		const access = await svc.getStaffEventAccess(staffUser, futureEvent.id, now);
		expect(access.day).toBe(today);
		expect(access.staffRoleName).toBe('Bar');
		expect(access.can('tasks')).toBe(true);
	});

	it('a Staff member with no Day now has no landing Event', async () => {
		const { futureEvent, staffUser } = await seed();
		const now = new Date();
		// A Day far from now (a year ahead).
		await testDb.insert(eventDays).values({ eventId: futureEvent.id, date: '2100-01-01' });
		const bar = await roleId('Bar');
		await testDb.insert(eventStaff).values({ eventId: futureEvent.id, userId: staffUser.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/staff-portal');
		const access = await svc.getStaffEventAccess(staffUser, futureEvent.id, now);
		expect(access.day).toBeNull();
	});

	it('a Staff member without an Assignment is refused', async () => {
		const { futureEvent, staffUser } = await seed();
		const svc = await import('../../src/lib/server/services/staff-portal');
		await expect(svc.getStaffEventAccess(staffUser, futureEvent.id)).rejects.toMatchObject({
			status: 403,
		});
	});

	it('an Admin sees every Event with every permission and no role', async () => {
		const { futureEvent, pastEvent, staffUser, adminUser } = await seed();
		await testDb.insert(eventDays).values({ eventId: futureEvent.id, date: '2099-06-01' });
		const salle = await roleId('Salle');
		await testDb
			.insert(eventStaff)
			.values({ eventId: futureEvent.id, userId: staffUser.id, staffRoleId: salle });

		const svc = await import('../../src/lib/server/services/staff-portal');
		const adminList = await svc.listStaffEvents(adminUser);
		expect(adminList.map((i) => i.event.id).sort()).toEqual([futureEvent.id, pastEvent.id].sort());
		expect(adminList.every((i) => i.staffRoleName === null)).toBe(true);

		const access = await svc.getStaffEventAccess(adminUser, futureEvent.id);
		expect(access.staffRoleName).toBeNull();
		expect(access.permissions).toHaveLength(11);
		expect(access.can('tasks')).toBe(true);

		// A Staff member only sees their own Assignments, upcoming first.
		const staffList = await svc.listStaffEvents(staffUser);
		expect(staffList.map((i) => i.event.id)).toEqual([futureEvent.id]);
		expect(staffList[0].staffRoleName).toBe('Salle');
		expect(staffList[0].days).toEqual(['2099-06-01']);
	});

	it('a role without the Tasks permission cannot update a Task status', async () => {
		const { futureEvent, staffUser, adminUser } = await seed();
		const now = new Date();
		const today = dayOf(now, ZONE);
		await testDb.insert(eventDays).values({ eventId: futureEvent.id, date: today });
		// A role with no Tasks permission (only dietary).
		const [role] = await testDb
			.insert(staffRoles)
			.values({ name: `Sans tâches ${crypto.randomUUID()}`, permissions: ['dietary'] })
			.returning();
		await testDb.insert(eventStaff).values({ eventId: futureEvent.id, userId: staffUser.id, staffRoleId: role.id });

		const svc = await import('../../src/lib/server/services/staff-portal');
		const access = await svc.getStaffEventAccess(staffUser, futureEvent.id, now);
		// The Tasks gate the portal's action checks before updating.
		expect(access.can('tasks')).toBe(false);
		// An Admin would pass the same gate.
		const adminAccess = await svc.getStaffEventAccess(adminUser, futureEvent.id, now);
		expect(adminAccess.can('tasks')).toBe(true);

		// Both doors refuse: the portal's form action and the status API.
		const [task] = await testDb
			.insert(tasks)
			.values({ eventId: futureEvent.id, assignedTo: staffUser.id, createdBy: adminUser.id, title: 'Accueil' })
			.returning();
		try {
			const { actions } = await import('../../src/routes/(staff)/staff/events/[id]/+page.server');
			const formData = new FormData();
			formData.set('taskId', task.id);
			formData.set('status', 'done');
			const result: any = await actions.updateTaskStatus({
				request: new Request('http://localhost', { method: 'POST', body: formData }),
				locals: { user: staffUser },
				params: { id: futureEvent.id },
			} as any);
			expect(result.status).toBe(403);

			const { PATCH } = await import('../../src/routes/api/staff/tasks/[id]/status/+server');
			const response = await PATCH({
				request: new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'done' }) }),
				locals: { user: staffUser },
				params: { id: task.id },
			} as any);
			expect(response.status).toBe(403);

			const [unchanged] = await testDb.select().from(tasks).where(eq(tasks.id, task.id));
			expect(unchanged.status).toBe('pending');
		} finally {
			// staff_roles is never truncated: remove the role this test made.
			await testDb.delete(eventStaff).where(eq(eventStaff.staffRoleId, role.id));
			await testDb.delete(staffRoles).where(eq(staffRoles.id, role.id));
		}
	});
});

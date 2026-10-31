// @vitest-environment node
/**
 * Issue 030 — Mes tâches: getTaskGroupsForUser groups the user's Tasks by
 * Event with the Day under way first, then upcoming, then past; and
 * updateUserTaskStatus refuses a Task assigned to someone else.
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
	const mkEvent = async (titleFr: string, start: string) => {
		const [event] = await testDb
			.insert(events)
			.values({
				titleEn: titleFr,
				titleFr,
				startDate: new Date(start),
				visibility: 'public',
				timeZone: ZONE,
			})
			.returning();
		return event;
	};
	const past = await mkEvent('Dîner passé', '2000-07-01T19:00:00Z');
	const future = await mkEvent('Dîner à venir', '2099-06-01T19:00:00Z');
	const underWay = await mkEvent('Dîner en cours', '2098-06-01T19:00:00Z');
	await testDb
		.insert(eventDays)
		.values({ eventId: underWay.id, date: dayOf(new Date(), ZONE) });

	const [staffUser] = await testDb
		.insert(users)
		.values({ email: `staff-${run}@example.com`, firstName: 'S', lastName: 'Taff', passwordHash: 'x', role: 'staff' })
		.returning();
	const [otherStaff] = await testDb
		.insert(users)
		.values({ email: `other-${run}@example.com`, firstName: 'O', lastName: 'Ther', passwordHash: 'x', role: 'staff' })
		.returning();

	const [role] = await testDb
		.select({ id: staffRoles.id })
		.from(staffRoles)
		.where(eq(staffRoles.name, 'Bar')); // permissions: ['tasks']
	if (!role) throw new Error('Missing seeded role Bar');
	for (const event of [past, future, underWay]) {
		await testDb.insert(eventStaff).values({ eventId: event.id, userId: staffUser.id, staffRoleId: role.id });
	}

	const mkTask = (eventId: string, title: string, assignedTo: string) =>
		testDb.insert(tasks).values({ eventId, assignedTo, createdBy: staffUser.id, title }).returning();

	await mkTask(past.id, 'Trier le stock', staffUser.id);
	await mkTask(future.id, 'Préparer la salle', staffUser.id);
	const [ownUnderWayTask] = await mkTask(underWay.id, 'Ouvrir les portes', staffUser.id);
	const [foreignTask] = await mkTask(future.id, 'Tâche d’un autre', otherStaff.id);

	return { staffUser, otherStaff, ownUnderWayTask, foreignTask };
}

describe('mes tâches', () => {
	it('groups the user’s Tasks by Event, Day under way first, then upcoming, then past', async () => {
		const { staffUser } = await seed();
		const svc = await import('../../src/lib/server/services/staff-tasks');

		const groups = await svc.getTaskGroupsForUser(staffUser);
		expect(groups.map((g) => g.event.titleFr)).toEqual(['Dîner en cours', 'Dîner à venir', 'Dîner passé']);
		expect(groups.map((g) => g.tasks.map((t) => t.title))).toEqual([
			['Ouvrir les portes'],
			['Préparer la salle'],
			['Trier le stock'],
		]);
	});

	it('updates one of the user’s own Tasks', async () => {
		const { staffUser, ownUnderWayTask } = await seed();
		const svc = await import('../../src/lib/server/services/staff-tasks');

		const result = await svc.updateUserTaskStatus(staffUser, ownUnderWayTask.id, 'done');
		expect(result).toEqual({ ok: true });
		const [row] = await testDb.select().from(tasks).where(eq(tasks.id, ownUnderWayTask.id));
		expect(row.status).toBe('done');
	});

	it('refuses a Task assigned to someone else', async () => {
		const { staffUser, foreignTask } = await seed();
		const svc = await import('../../src/lib/server/services/staff-tasks');

		const result = await svc.updateUserTaskStatus(staffUser, foreignTask.id, 'done');
		expect(result).toEqual({ ok: false, status: 404, error: 'Tâche introuvable.' });
	});
});

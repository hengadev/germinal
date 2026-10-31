// @vitest-environment node
/**
 * Issue 032 — an Event's Brief: saveEventBrief trims, deletes emptied
 * parts and refuses roles not assigned on the Event; getEventBrief
 * returns the general part and every role part with its role's name,
 * which the Staff portal filters per viewer.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { eventRoleBriefs, events, eventStaff, staffRoles, users } from '../../src/lib/server/db/schema';
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

async function seed() {
	const run = crypto.randomUUID();
	const [event] = await testDb
		.insert(events)
		.values({
			titleFr: 'Briefed',
			startDate: new Date('2099-06-01T19:00:00Z'),
			endDate: new Date('2099-06-01T22:00:00Z'),
			visibility: 'public',
		})
		.returning();
	const [roleA] = await testDb
		.insert(staffRoles)
		.values({ name: `Chef ${run}` })
		.returning();
	const [roleB] = await testDb
		.insert(staffRoles)
		.values({ name: `Runner ${run}` })
		.returning();
	const [staffUser] = await testDb
		.insert(users)
		.values({ email: `staff-${run}@example.com`, firstName: 'S', lastName: 'T', passwordHash: 'x', role: 'staff' })
		.returning();
	await testDb.insert(eventStaff).values({
		eventId: event.id,
		userId: staffUser.id,
		staffRoleId: roleA.id,
	});
	return { event, roleA, roleB, staffUser };
}

describe('saveEventBrief', () => {
	it('trims and keeps the general part and assigned role parts', async () => {
		const { saveEventBrief } = await import('../../src/lib/server/services/staff-brief');
		const { event, roleA } = await seed();
		await saveEventBrief(event.id, {
			general: '  Portes à 18h  ',
			roles: { [roleA.id]: '  Plan des tables en cuisine  ' },
		});
		const brief = await (await import('../../src/lib/server/services/staff-brief')).getEventBrief(event.id);
		expect(brief.general).toBe('Portes à 18h');
		expect(brief.roles).toEqual([
			{ staffRoleId: roleA.id, staffRoleName: expect.any(String), body: 'Plan des tables en cuisine' },
		]);
	});

	it('refuses a role not assigned on the Event', async () => {
		const { saveEventBrief, UnassignedRoleError } = await import('../../src/lib/server/services/staff-brief');
		const { event, roleB } = await seed();
		await expect(saveEventBrief(event.id, { roles: { [roleB.id]: 'nope' } })).rejects.toBeInstanceOf(
			UnassignedRoleError
		);
	});

	it('clears an emptied general part and deletes an emptied role part', async () => {
		const { saveEventBrief, getEventBrief } = await import('../../src/lib/server/services/staff-brief');
		const { event, roleA } = await seed();
		await saveEventBrief(event.id, { general: 'Général', roles: { [roleA.id]: 'Partie' } });
		await saveEventBrief(event.id, { general: '   ', roles: { [roleA.id]: '' } });
		expect(await getEventBrief(event.id)).toEqual({ general: null, roles: [] });
		const rows = await testDb
			.select()
			.from(eventRoleBriefs)
			.where(eq(eventRoleBriefs.eventId, event.id));
		expect(rows).toEqual([]);
	});
});

describe('what each viewer gets (portal filtering)', () => {
	it('a Staff member sees the general part and only their role, an Admin all parts', async () => {
		const { saveEventBrief, getEventBrief } = await import('../../src/lib/server/services/staff-brief');
		const { getStaffEventAccess } = await import('../../src/lib/server/services/staff-portal');
		const { event, roleA, roleB, staffUser } = await seed();
		// A second, unassigned role part exists for the Admin only.
		const [otherStaff] = await testDb
			.insert(users)
			.values({ email: `other-${crypto.randomUUID()}@example.com`, firstName: 'O', lastName: 'S', passwordHash: 'x', role: 'staff' })
			.returning();
		await testDb.insert(eventStaff).values({
			eventId: event.id,
			userId: otherStaff.id,
			staffRoleId: roleB.id,
		});
		await saveEventBrief(event.id, {
			general: 'Tous',
			roles: { [roleA.id]: 'Pour A', [roleB.id]: 'Pour B' },
		});

		const brief = await getEventBrief(event.id);
		expect(brief.roles).toHaveLength(2);

		const staffAccess = await getStaffEventAccess(
			{ id: staffUser.id, role: 'staff' },
			event.id,
			new Date('2099-01-01T12:00:00Z')
		);
		expect(staffAccess.staffRoleId).toBe(roleA.id);
		expect(brief.roles.filter((r) => r.staffRoleId === staffAccess.staffRoleId).map((r) => r.body)).toEqual([
			'Pour A',
		]);

		const [admin] = await testDb
			.insert(users)
			.values({ email: `admin-${crypto.randomUUID()}@example.com`, firstName: 'A', lastName: 'D', passwordHash: 'x', role: 'admin' })
			.returning();
		const adminAccess = await getStaffEventAccess(
			{ id: admin.id, role: 'admin' },
			event.id,
			new Date('2099-01-01T12:00:00Z')
		);
		expect(adminAccess.staffRoleId).toBeNull();
		expect(brief.roles.filter((r) => r.staffRoleId === adminAccess.staffRoleId)).toEqual([]);
	});
});

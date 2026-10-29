// @vitest-environment node
/**
 * Issue 014 — Assignment permission adjustments: grants and withdrawals
 * recorded relative to the Staff Role, no contradictory entries after
 * re-ticking, adjustments survive a Staff Role edit, and only touch the one
 * Assignment.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { events, eventStaff, staffRoles, users } from '../../src/lib/server/db/schema';
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

vi.mock('../../src/lib/server/services/email', () => ({
	sendStaffAssignmentEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendStaffAssignmentSMS: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
	await setupTestDatabase();
});

afterAll(async () => {
	await closeTestDatabase();
});



async function seed() {
	const run = crypto.randomUUID();
	const [eventA] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner A',
			titleFr: 'Dîner A',
			startDate: new Date('2099-06-01T19:00:00Z'),
			endDate: new Date('2099-06-01T22:00:00Z'),
			visibility: 'public',
		})
		.returning();
	const [eventB] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner B',
			titleFr: 'Dîner B',
			startDate: new Date('2099-07-01T19:00:00Z'),
			endDate: new Date('2099-07-01T22:00:00Z'),
			visibility: 'public',
		})
		.returning();
	const [staff] = await testDb
		.insert(users)
		.values({ email: `staff-${run}@example.com`, firstName: 'S', lastName: 'Taff', passwordHash: 'x', role: 'staff' })
		.returning();
	return { eventA, eventB, staff };
}

async function roleId(name: string): Promise<string> {
	const [role] = await testDb.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.name, name));
	if (!role) throw new Error(`Missing seeded role ${name}`);
	return role.id;
}

async function assignmentRow(eventId: string, userId: string) {
	const [row] = await testDb
		.select()
		.from(eventStaff)
		.where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, userId)))
		.limit(1);
	if (!row) throw new Error('Assignment not found');
	return row;
}

describe('assignment permission adjustments', () => {
	it('records grants and withdrawals relative to the Staff Role', async () => {
		const { eventA, staff } = await seed();
		const bar = await roleId('Bar'); // permissions: ['tasks']
		await testDb.insert(eventStaff).values({ eventId: eventA.id, userId: staff.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/event-staff');
		// Bar has tasks; the Admin ticks tasks + manual_check_in (and the
		// client ticks guest_list with it) but unticks tasks.
		await svc.adjustAssignmentPermissions(eventA.id, staff.id, ['manual_check_in', 'guest_list']);

		const row = await assignmentRow(eventA.id, staff.id);
		expect([...row.grantedPermissions].sort()).toEqual(['guest_list', 'manual_check_in']);
		expect([...row.withdrawnPermissions]).toEqual(['tasks']);
	});

	it('re-ticking clears adjustments instead of stacking contradictory entries', async () => {
		const { eventA, staff } = await seed();
		const salle = await roleId('Salle'); // tasks, settle_balance, guest_list
		await testDb.insert(eventStaff).values({ eventId: eventA.id, userId: staff.id, staffRoleId: salle });

		const svc = await import('../../src/lib/server/services/event-staff');
		// Withdraw settle_balance and guest_list
		await svc.adjustAssignmentPermissions(eventA.id, staff.id, ['tasks']);
		let row = await assignmentRow(eventA.id, staff.id);
		expect([...row.withdrawnPermissions].sort()).toEqual(['guest_list', 'settle_balance']);
		expect([...row.grantedPermissions]).toEqual([]);

		// Re-tick everything the role has: adjustments clear entirely
		await svc.adjustAssignmentPermissions(eventA.id, staff.id, ['tasks', 'guest_list', 'settle_balance']);
		row = await assignmentRow(eventA.id, staff.id);
		expect([...row.grantedPermissions]).toEqual([]);
		expect([...row.withdrawnPermissions]).toEqual([]);
	});

	it('keeps adjustments across an edit of the Staff Role', async () => {
		const { eventA, staff } = await seed();
		const bar = await roleId('Bar'); // ['tasks']
		await testDb.insert(eventStaff).values({ eventId: eventA.id, userId: staff.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/event-staff');
		await svc.adjustAssignmentPermissions(eventA.id, staff.id, ['tasks', 'dietary']);
		// Role edit adds dietary to the base; the adjustments stay as they are
		const roles = await import('../../src/lib/server/services/staff-roles');
		try {
			await roles.updateStaffRole(bar, { permissions: ['tasks', 'dietary', 'comp'] }, 'test-admin');

			const row = await assignmentRow(eventA.id, staff.id);
			expect([...row.grantedPermissions]).toEqual(['dietary']);
			expect([...row.withdrawnPermissions]).toEqual([]);
		} finally {
			// staff_roles is never truncated: restore the seeded permissions now,
			// not afterAll, so later tests see the pristine role.
			await roles.updateStaffRole(bar, { permissions: ['tasks'] }, 'test-admin').catch(() => undefined);
		}
	});

	it('leaves the same person’s other Assignments untouched', async () => {
		const { eventA, eventB, staff } = await seed();
		const bar = await roleId('Bar');
		const porte = await roleId('Porte');
		await testDb.insert(eventStaff).values([
			{ eventId: eventA.id, userId: staff.id, staffRoleId: bar },
			{ eventId: eventB.id, userId: staff.id, staffRoleId: porte },
		]);

		const svc = await import('../../src/lib/server/services/event-staff');
		await svc.adjustAssignmentPermissions(eventA.id, staff.id, ['comp', 'guest_list']);

		const a = await assignmentRow(eventA.id, staff.id);
		const b = await assignmentRow(eventB.id, staff.id);
		expect([...a.grantedPermissions].sort()).toEqual(['comp', 'guest_list']);
		expect([...b.grantedPermissions]).toEqual([]);
		expect([...b.withdrawnPermissions]).toEqual([]);
	});

	it('rejects unknown permissions', async () => {
		const { eventA, staff } = await seed();
		const bar = await roleId('Bar');
		await testDb.insert(eventStaff).values({ eventId: eventA.id, userId: staff.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/event-staff');
		await expect(
			svc.adjustAssignmentPermissions(eventA.id, staff.id, ['tasks', 'nope' as never])
		).rejects.toMatchObject({ code: 'INVALID_PERMISSION' });
	});

	it('getStaffForEvent exposes role permissions and adjustments', async () => {
		const { eventA, staff } = await seed();
		const bar = await roleId('Bar');
		await testDb.insert(eventStaff).values({ eventId: eventA.id, userId: staff.id, staffRoleId: bar });

		const svc = await import('../../src/lib/server/services/event-staff');
		await svc.adjustAssignmentPermissions(eventA.id, staff.id, ['comp', 'guest_list']);

		const list = await svc.getStaffForEvent(eventA.id);
		expect(list).toHaveLength(1);
		expect(list[0].staffRole.permissions).toEqual(['tasks']);
		expect([...list[0].grantedPermissions].sort()).toEqual(['comp', 'guest_list']);
		expect(list[0].withdrawnPermissions).toEqual(['tasks']);
	});
});

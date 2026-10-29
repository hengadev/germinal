// @vitest-environment node
/**
 * Issue 013 — Staff Roles: seeding, live permission edits seen through
 * Assignments, archive vs delete, refusing to delete a role in use, archived
 * roles not assignable, and the server-side guest-list closure.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, events, staffRoles, users } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import { STARTING_STAFF_ROLES } from '../../src/lib/staff/permissions';

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

async function seedEventAndStaff() {
	const run = crypto.randomUUID();
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startDate: new Date('2099-06-01T19:00:00Z'),
			endDate: new Date('2099-06-01T22:00:00Z'),
			visibility: 'public',
		})
		.returning();
	const [staff] = await testDb
		.insert(users)
		.values({ email: `staff-${run}@example.com`, firstName: 'S', lastName: 'Taff', passwordHash: 'x', role: 'staff' })
		.returning();
	return { event, staff };
}

async function roleId(name: string): Promise<string> {
	const [role] = await testDb.select({ id: staffRoles.id }).from(staffRoles).where(eq(staffRoles.name, name));
	if (!role) throw new Error(`Missing seeded role ${name}`);
	return role.id;
}

/** Roles created by a test, deleted on the way out (staff_roles is never truncated). */
const created: string[] = [];
async function cleanupRoles() {
	const m = await import('../../src/lib/server/services/staff-roles');
	for (const id of created.splice(0)) {
		await m.setStaffRoleArchived(id, false, 'test-admin').catch(() => undefined);
		await m.deleteStaffRole(id, 'test-admin').catch(() => undefined);
	}
}

describe('staff roles', () => {
	it('seeds the six starting roles with the exact permissions', async () => {
		const rows = await testDb.select().from(staffRoles).orderBy(staffRoles.name);
		const byName = new Map(rows.map((r) => [r.name, [...r.permissions].sort()]));
		for (const starting of STARTING_STAFF_ROLES) {
			expect(byName.has(starting.name)).toBe(true);
			expect(byName.get(starting.name)).toEqual([...starting.permissions].sort());
		}
	});

	it('a live permission edit is seen when reading an existing Assignment', async () => {
		const { event, staff } = await seedEventAndStaff();
		const { assignStaff, getStaffForEvent } = await import('../../src/lib/server/services/event-staff');
		const { updateStaffRole } = await import('../../src/lib/server/services/staff-roles');

		const porteId = await roleId('Porte');
		await assignStaff(event.id, staff.id, porteId);

		const updated = await updateStaffRole(
			porteId,
			{ permissions: ['tasks', 'dietary'] },
			'test-admin'
		);
		expect(updated.permissions).toEqual(['tasks', 'dietary']);

		// The Assignment refers to the role: it sees the new permissions at once.
		const list = await getStaffForEvent(event.id);
		expect(list[0].staffRole.id).toBe(porteId);
		const [freshRole] = await testDb.select().from(staffRoles).where(eq(staffRoles.id, porteId));
		expect([...freshRole.permissions].sort()).toEqual(['dietary', 'tasks']);

		// staff_roles is never truncated: restore the seeded Porte for other runs.
		const startingPorte = STARTING_STAFF_ROLES.find((r) => r.name === 'Porte')!;
		await updateStaffRole(porteId, { permissions: startingPorte.permissions }, 'test-admin');
	});

	it('archives a role, keeps its Assignments working, and refuses assignment of an archived role', async () => {
		const { event, staff } = await seedEventAndStaff();
		const { assignStaff, getEventsForStaff, StaffAssignmentError } = await import('../../src/lib/server/services/event-staff');
		const { setStaffRoleArchived, listAssignableStaffRoles } = await import('../../src/lib/server/services/staff-roles');

		const salleId = await roleId('Salle');
		await assignStaff(event.id, staff.id, salleId);

		await setStaffRoleArchived(salleId, true, 'test-admin');

		// Not in the picker anymore
		const assignable = await listAssignableStaffRoles();
		expect(assignable.some((r) => r.id === salleId)).toBe(false);

		// But the existing Assignment is unaffected
		const assignments = await getEventsForStaff(staff.id);
		expect(assignments[0].staffRole.name).toBe('Salle');

		// And it cannot be used for a new assignment
		const { event: event2, staff: staff2 } = await seedEventAndStaff();
		await expect(assignStaff(event2.id, staff2.id, salleId)).rejects.toMatchObject({
			code: 'ROLE_NOT_ASSIGNABLE',
		});
		expect(typeof StaffAssignmentError).toBe('function');

		// Restore the seeded Salle (staff_roles is never truncated).
		await setStaffRoleArchived(salleId, false, 'test-admin');
	});

	it('refuses to delete a role used by an Assignment, but deletes an unused one', async () => {
		const { event, staff } = await seedEventAndStaff();
		const { assignStaff } = await import('../../src/lib/server/services/event-staff');
		const { createStaffRole, deleteStaffRole, setStaffRoleArchived } = await import('../../src/lib/server/services/staff-roles');

		const run = crypto.randomUUID();
		const used = await createStaffRole({ name: `Test used ${run}`, permissions: ['tasks'] }, 'test-admin');
		const unused = await createStaffRole({ name: `Test unused ${run}`, permissions: ['tasks'] }, 'test-admin');
		created.push(used.id, unused.id);

		await assignStaff(event.id, staff.id, used.id);
		await expect(deleteStaffRole(used.id, 'test-admin')).rejects.toMatchObject({ code: 'IN_USE' });

		await expect(deleteStaffRole(unused.id, 'test-admin')).resolves.toBeUndefined();

		// An archived but used role still cannot be deleted
		await setStaffRoleArchived(used.id, true, 'test-admin');
		await expect(deleteStaffRole(used.id, 'test-admin')).rejects.toMatchObject({ code: 'IN_USE' });
		await cleanupRoles();
	});

	it('enforces the guest-list closure server-side', async () => {
		const { createStaffRole } = await import('../../src/lib/server/services/staff-roles');
		const run = crypto.randomUUID();
		const role = await createStaffRole(
			{ name: `Test closure ${run}`, permissions: ['tasks', 'move', 'comp'] },
			'test-admin'
		);
		created.push(role.id);
		expect(role.permissions).toContain('guest_list');

		await expect(
			createStaffRole({ name: `Test bad ${run}`, permissions: ['cancel'] }, 'test-admin')
		).rejects.toMatchObject({ code: 'INVALID_PERMISSIONS' });
		await cleanupRoles();
	});

	it('refuses duplicate names', async () => {
		const { createStaffRole } = await import('../../src/lib/server/services/staff-roles');
		const run = crypto.randomUUID();
		const role = await createStaffRole({ name: `Test dup ${run}`, permissions: [] }, 'test-admin');
		created.push(role.id);
		await expect(
			createStaffRole({ name: `Test dup ${run}`, permissions: [] }, 'test-admin')
		).rejects.toMatchObject({ code: 'NAME_TAKEN' });
		await cleanupRoles();
	});

	it('records Staff Role changes in the audit log', async () => {
		const [admin] = await testDb
			.insert(users)
			.values({ email: `admin-${crypto.randomUUID()}@example.com`, firstName: 'A', lastName: 'Dmin', passwordHash: 'x', role: 'admin' })
			.returning();
		const { createStaffRole, updateStaffRole, setStaffRoleArchived, deleteStaffRole } = await import('../../src/lib/server/services/staff-roles');

		const role = await createStaffRole({ name: `Test audit ${crypto.randomUUID()}`, permissions: ['tasks'] }, admin.id);
		await updateStaffRole(role.id, { permissions: ['tasks', 'dietary'] }, admin.id);
		await setStaffRoleArchived(role.id, true, admin.id);
		await setStaffRoleArchived(role.id, false, admin.id);
		await deleteStaffRole(role.id, admin.id);

		const rows = await testDb.select().from(auditLog).where(eq(auditLog.entityId, role.id));
		expect(rows.map((r) => r.action).sort()).toEqual([
			'staff_role.archive',
			'staff_role.create',
			'staff_role.delete',
			'staff_role.restore',
			'staff_role.update',
		]);
		expect(rows.every((r) => r.adminId === admin.id)).toBe(true);
	});

	it("changes an Assignment's role, but never to an archived one", async () => {
		const { event, staff } = await seedEventAndStaff();
		const { assignStaff, changeAssignmentRole, getStaffForEvent } = await import('../../src/lib/server/services/event-staff');
		const { createStaffRole, setStaffRoleArchived } = await import('../../src/lib/server/services/staff-roles');

		await assignStaff(event.id, staff.id, await roleId('Bar'));
		await changeAssignmentRole(event.id, staff.id, await roleId('Cuisine'));
		expect((await getStaffForEvent(event.id))[0].staffRole.name).toBe('Cuisine');

		const archived = await createStaffRole({ name: `Test archived ${crypto.randomUUID()}`, permissions: ['tasks'] }, 'test-admin');
		created.push(archived.id);
		await setStaffRoleArchived(archived.id, true, 'test-admin');
		await expect(changeAssignmentRole(event.id, staff.id, archived.id)).rejects.toMatchObject({
			code: 'ROLE_NOT_ASSIGNABLE',
		});
		expect((await getStaffForEvent(event.id))[0].staffRole.name).toBe('Cuisine');
		await cleanupRoles();
	});
});

import { describe, it, expect } from 'vitest';
import {
	STAFF_PERMISSIONS,
	ACTS_ON_PARTIES_PERMISSIONS,
	withImpliedPermissions,
	STAFF_PERMISSION_LABELS_FR,
	STARTING_STAFF_ROLES,
	isStaffPermission,
} from '../../../../src/lib/staff/permissions';

describe('staff permissions catalogue', () => {
	it('has a French label for every permission', () => {
		for (const p of STAFF_PERMISSIONS) {
			expect(STAFF_PERMISSION_LABELS_FR[p].length).toBeGreaterThan(0);
		}
	});

	it('contains no cancel, refund or internal-notes permission', () => {
		for (const forbidden of ['cancel', 'refund', 'internal_notes', 'notes']) {
			expect(STAFF_PERMISSIONS).not.toContain(forbidden);
		}
	});

	it('adds guest_list when a permission acting on parties is present', () => {
		expect(withImpliedPermissions(['tasks'])).toEqual(['tasks']);
		expect(withImpliedPermissions(['tasks', 'move'])).toEqual(['tasks', 'guest_list', 'move']);
		expect(withImpliedPermissions(['comp'])).toEqual(['guest_list', 'comp']);
		expect(withImpliedPermissions([])).toEqual([]);
	});

	it('does not duplicate guest_list when already present', () => {
		expect(withImpliedPermissions(['guest_list', 'scan_check_in'])).toEqual([
			'guest_list',
			'scan_check_in',
		]);
	});

	it('recognises only catalogue members', () => {
		expect(isStaffPermission('tasks')).toBe(true);
		expect(isStaffPermission('cancel')).toBe(false);
		expect(isStaffPermission(null)).toBe(false);
	});

	it('seeds six starting roles with the expected permissions', () => {
		expect(STARTING_STAFF_ROLES.map((r) => r.name)).toEqual([
			'Responsable',
			'Porte',
			'Salle',
			'Cuisine',
			'Bar',
			'Photographe',
		]);
		const responsable = STARTING_STAFF_ROLES[0].permissions;
		expect(responsable).toContain('correct_mistake');
		expect(responsable).not.toContain('comp');
		expect(STARTING_STAFF_ROLES[1].permissions).toEqual([
			'tasks',
			'guest_list',
			'scan_check_in',
			'move',
			'walk_in',
		]);
		expect(STARTING_STAFF_ROLES[2].permissions).toEqual(['tasks', 'guest_list', 'settle_balance']);
	});
});

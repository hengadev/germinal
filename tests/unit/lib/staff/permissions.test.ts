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

	it('adds cancel_refund: labelled, acting on parties, absent from starting roles', () => {
		expect(STAFF_PERMISSIONS).toContain('cancel_refund');
		expect(STAFF_PERMISSION_LABELS_FR.cancel_refund).toBe('Annuler et rembourser');
		expect(ACTS_ON_PARTIES_PERMISSIONS.has('cancel_refund')).toBe(true);
		expect(withImpliedPermissions(['cancel_refund'])).toEqual(['guest_list', 'cancel_refund']);
		for (const role of STARTING_STAFF_ROLES) {
			expect(role.permissions).not.toContain('cancel_refund');
		}
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

describe('close_bookings (039)', () => {
	it('exists with its French label and does not act on parties', () => {
		expect(STAFF_PERMISSIONS).toContain('close_bookings');
		expect(STAFF_PERMISSION_LABELS_FR.close_bookings).toBe('Fermer aux réservations');
		expect(ACTS_ON_PARTIES_PERMISSIONS.has('close_bookings')).toBe(false);
	});

	it('is in no starting Staff Role', () => {
		for (const role of STARTING_STAFF_ROLES) {
			expect(role.permissions).not.toContain('close_bookings');
		}
	});
});

describe('invite (040)', () => {
	it('exists with its French label and does not act on parties', () => {
		expect(STAFF_PERMISSIONS).toContain('invite');
		expect(STAFF_PERMISSION_LABELS_FR.invite).toBe('Créer une invitation');
		expect(ACTS_ON_PARTIES_PERMISSIONS.has('invite')).toBe(false);
	});

	it('is in no starting Staff Role', () => {
		for (const role of STARTING_STAFF_ROLES) {
			expect(role.permissions).not.toContain('invite');
		}
	});
});

describe('change_party (048)', () => {
	it('exists with its French label and acts on parties', () => {
		expect(STAFF_PERMISSIONS).toContain('change_party');
		expect(STAFF_PERMISSION_LABELS_FR.change_party).toBe('Modifier le nombre de personnes');
		expect(ACTS_ON_PARTIES_PERMISSIONS.has('change_party')).toBe(true);
		expect(withImpliedPermissions(['change_party'])).toEqual(['guest_list', 'change_party']);
	});

	it('is in no starting Staff Role', () => {
		for (const role of STARTING_STAFF_ROLES) {
			expect(role.permissions).not.toContain('change_party');
		}
	});
});

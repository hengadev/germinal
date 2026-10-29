/**
 * The Staff Permission catalogue — the single closed list in code from which
 * every Staff issue reads permissions (issue 013). Importable from client
 * and server: no server-only imports here.
 */

export const STAFF_PERMISSIONS = [
	'tasks',
	'guest_list',
	'scan_check_in',
	'manual_check_in',
	'dietary',
	'contact',
	'settle_balance',
	'correct_mistake',
	'move',
	'walk_in',
	'comp',
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_PERMISSION_LABELS_FR: Record<StaffPermission, string> = {
	tasks: 'Tâches',
	guest_list: 'Liste des invités',
	scan_check_in: 'Check-in par scan',
	manual_check_in: 'Check-in à la main',
	dietary: 'Régimes alimentaires',
	contact: 'Coordonnées',
	settle_balance: 'Marquer un solde réglé',
	correct_mistake: 'Corriger une erreur',
	move: 'Déplacer',
	walk_in: 'Walk-in',
	comp: 'Comp',
};

/**
 * Permissions that act on parties: ticking any of them implies the guest
 * list (the picker ticks it client-side; the server enforces the same
 * closure in withImpliedPermissions).
 */
export const ACTS_ON_PARTIES_PERMISSIONS: ReadonlySet<StaffPermission> = new Set([
	'scan_check_in',
	'manual_check_in',
	'settle_balance',
	'move',
	'walk_in',
	'comp',
]);

/**
 * Add the permissions a set implies: every permission that acts on parties
 * also grants the guest list.
 */
export function withImpliedPermissions(perms: Iterable<StaffPermission>): StaffPermission[] {
	const set = new Set<StaffPermission>(perms);
	if ([...ACTS_ON_PARTIES_PERMISSIONS].some((p) => set.has(p))) set.add('guest_list');
	return STAFF_PERMISSIONS.filter((p) => set.has(p));
}

export function isStaffPermission(value: unknown): value is StaffPermission {
	return typeof value === 'string' && (STAFF_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * The six starting Staff Roles (a fresh database is seeded with them).
 * Used by the integration tests; the SQL migration carries its own copy.
 */
export const STARTING_STAFF_ROLES: ReadonlyArray<{
	name: string;
	permissions: StaffPermission[];
}> = [
	{
		name: 'Responsable',
		permissions: withImpliedPermissions(STAFF_PERMISSIONS.filter((p) => p !== 'comp')),
	},
	{
		name: 'Porte',
		permissions: withImpliedPermissions(['tasks', 'scan_check_in', 'move', 'walk_in']),
	},
	{ name: 'Salle', permissions: withImpliedPermissions(['tasks', 'settle_balance']) },
	{ name: 'Cuisine', permissions: ['tasks', 'dietary'] },
	{ name: 'Bar', permissions: ['tasks'] },
	{ name: 'Photographe', permissions: ['tasks'] },
];

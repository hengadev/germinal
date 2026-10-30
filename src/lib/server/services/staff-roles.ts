import { db } from '../db';
import { staffRoles, eventStaff } from '../db/schema';
import { eq, sql, asc, desc, isNull } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import {
	STAFF_PERMISSIONS,
	withImpliedPermissions,
	isStaffPermission,
	type StaffPermission,
} from '$lib/staff/permissions';
import { recordAuditLog } from './audit-log';

export class StaffRoleError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'NOT_FOUND'
			| 'NAME_TAKEN'
			| 'INVALID_NAME'
			| 'INVALID_PERMISSIONS'
			| 'IN_USE'
	) {
		super(message);
		this.name = 'StaffRoleError';
	}
}

export interface StaffRole {
	id: string;
	name: string;
	permissions: string[];
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** A Staff Role with the number of Assignments referring to it. */
export interface StaffRoleWithUsage extends StaffRole {
	assignmentCount: number;
}

function parsePermissions(raw: string[] | null | undefined): StaffPermission[] {
	return (raw ?? []).filter(isStaffPermission);
}

/**
 * All Staff Roles with their usage count, non-archived first.
 */
export async function listStaffRoles(): Promise<StaffRoleWithUsage[]> {
	const rows = await db
		.select({
			id: staffRoles.id,
			name: staffRoles.name,
			permissions: staffRoles.permissions,
			archivedAt: staffRoles.archivedAt,
			createdAt: staffRoles.createdAt,
			updatedAt: staffRoles.updatedAt,
			assignmentCount: sql<number>`(select count(*)::int from ${eventStaff} where ${eventStaff.staffRoleId} = ${staffRoles.id})`,
		})
		.from(staffRoles)
		.orderBy(desc(isNull(staffRoles.archivedAt)), asc(staffRoles.name));
	return rows.map((r: typeof rows[number]) => ({ ...r, permissions: parsePermissions(r.permissions) }));
}

export async function getStaffRole(id: string): Promise<StaffRole | null> {
	const [row] = await db.select().from(staffRoles).where(eq(staffRoles.id, id)).limit(1);
	return row ? { ...row, permissions: parsePermissions(row.permissions) } : null;
}

function validatePermissions(raw: unknown): StaffPermission[] {
	const list = Array.isArray(raw) ? raw : [];
	if (!list.every(isStaffPermission)) {
		throw new StaffRoleError('Permission inconnue', 'INVALID_PERMISSIONS');
	}
	return withImpliedPermissions(list as StaffPermission[]);
}

function isUniqueNameViolation(error: unknown): boolean {
	const anyError = error as { code?: string; cause?: { code?: string } };
	return anyError?.code === '23505' || anyError?.cause?.code === '23505';
}

export async function createStaffRole(
	input: { name: string; permissions: unknown },
	adminId: string
): Promise<StaffRole> {
	const name = input.name.trim();
	if (!name) throw new StaffRoleError('Le nom du rôle est requis', 'INVALID_NAME');
	const permissions = validatePermissions(input.permissions);

	try {
		const [row] = await db
			.insert(staffRoles)
			.values({ name, permissions })
			.returning();
		await recordAuditLog({
			adminId,
			action: 'staff_role.create',
			entityType: 'staff_role',
			entityId: row.id,
			metadata: { name, permissions },
		});
		return { ...row, permissions: parsePermissions(row.permissions) };
	} catch (error) {
		if (isUniqueNameViolation(error)) {
			throw new StaffRoleError(`Un rôle nommé « ${name} » existe déjà`, 'NAME_TAKEN');
		}
		logger.error({ err: error }, 'Failed to create staff role');
		throw error;
	}
}

export async function updateStaffRole(
	id: string,
	input: { name?: string; permissions?: unknown },
	adminId: string
): Promise<StaffRole> {
	const [existing] = await db.select().from(staffRoles).where(eq(staffRoles.id, id)).limit(1);
	if (!existing) throw new StaffRoleError('Rôle introuvable', 'NOT_FOUND');

	const values: Partial<{ name: string; permissions: StaffPermission[] }> = {};
	if (input.name !== undefined) {
		const name = input.name.trim();
		if (!name) throw new StaffRoleError('Le nom du rôle est requis', 'INVALID_NAME');
		values.name = name;
	}
	if (input.permissions !== undefined) {
		values.permissions = validatePermissions(input.permissions);
	}

	try {
		const [row] = await db
			.update(staffRoles)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(staffRoles.id, id))
			.returning();
		await recordAuditLog({
			adminId,
			action: 'staff_role.update',
			entityType: 'staff_role',
			entityId: id,
			metadata: { name: row.name, permissions: row.permissions },
		});
		return { ...row, permissions: parsePermissions(row.permissions) };
	} catch (error) {
		if (isUniqueNameViolation(error)) {
			throw new StaffRoleError(`Un rôle nommé « ${values.name} » existe déjà`, 'NAME_TAKEN');
		}
		logger.error({ err: error }, 'Failed to update staff role');
		throw error;
	}
}

export async function setStaffRoleArchived(
	id: string,
	archived: boolean,
	adminId: string
): Promise<StaffRole> {
	const [row] = await db
		.update(staffRoles)
		.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
		.where(eq(staffRoles.id, id))
		.returning();
	if (!row) throw new StaffRoleError('Rôle introuvable', 'NOT_FOUND');
	await recordAuditLog({
		adminId,
		action: archived ? 'staff_role.archive' : 'staff_role.restore',
		entityType: 'staff_role',
		entityId: id,
		metadata: { name: row.name },
	});
	return { ...row, permissions: parsePermissions(row.permissions) };
}

export async function deleteStaffRole(id: string, adminId: string): Promise<void> {
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(eventStaff)
		.where(eq(eventStaff.staffRoleId, id));
	if (count > 0) {
		throw new StaffRoleError(
			'Ce rôle est utilisé par des assignations : archivez-le plutôt que de le supprimer',
			'IN_USE'
		);
	}
	const [row] = await db.delete(staffRoles).where(eq(staffRoles.id, id)).returning();
	if (!row) throw new StaffRoleError('Rôle introuvable', 'NOT_FOUND');
	await recordAuditLog({
		adminId,
		action: 'staff_role.delete',
		entityType: 'staff_role',
		entityId: id,
		metadata: { name: row.name },
	});
}

/** Non-archived roles, for assignment pickers. */
export async function listAssignableStaffRoles(): Promise<StaffRole[]> {
	const rows = await db
		.select()
		.from(staffRoles)
		.where(isNull(staffRoles.archivedAt))
		.orderBy(asc(staffRoles.name));
	return rows.map((r: (typeof rows)[number]) => ({ ...r, permissions: parsePermissions(r.permissions) }));
}

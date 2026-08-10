import { db } from '../db';
import { auditLog } from '../db/schema';
import { logger } from '$lib/server/logger';
import { desc } from 'drizzle-orm';

/**
 * Known audit actions for the tracked destructive/sensitive admin operations.
 * The `action` column is a plain varchar (not a DB enum) so new action types
 * can be logged without a migration - this union just gives call sites
 * autocomplete/typo-safety.
 */
export type AuditAction =
	| 'reservation.cancel'
	| 'reservation.refund'
	| 'event.delete'
	| 'session.delete'
	| 'talent.delete'
	| 'settings.update'
	| (string & {});

export type AuditEntityType = 'reservation' | 'event' | 'session' | 'talent' | 'settings' | (string & {});

interface RecordAuditLogInput {
	/** id of the acting Admin (locals.user.id after requireAdmin) */
	adminId: string;
	action: AuditAction;
	entityType: AuditEntityType;
	entityId?: string | null;
	metadata?: Record<string, unknown> | null;
}

/**
 * Lightweight insert helper for the audit_log table. Called directly from
 * each destructive/sensitive admin action site (reservation cancel/refund,
 * event/session/talent delete, settings changes) - no middleware/wrapper.
 *
 * Audit logging must never block or fail the primary action, so failures
 * here are swallowed and logged rather than thrown.
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
	try {
		await db.insert(auditLog).values({
			adminId: input.adminId,
			action: input.action,
			entityType: input.entityType,
			entityId: input.entityId ?? null,
			metadata: input.metadata ?? null,
		});
	} catch (err) {
		logger.error(
			{ err, action: input.action, entityType: input.entityType, entityId: input.entityId },
			'[AuditLog] Failed to record audit entry'
		);
	}
}

/**
 * Returns the audit trail as a simple reverse-chronological list (most
 * recent first). No filtering/search for v1 per the issue scope.
 */
export async function listAuditLog(limit = 200) {
	return db.query.auditLog.findMany({
		with: {
			admin: {
				columns: {
					id: true,
					email: true,
				},
			},
		},
		orderBy: [desc(auditLog.createdAt)],
		limit,
	});
}

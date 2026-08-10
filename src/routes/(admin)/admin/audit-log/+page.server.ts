import { env } from '$lib/server/env';
import { requireAdmin } from '$lib/server/auth-guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	if (env.USE_MOCK_DATA) {
		// Mock mode - no database to read the audit trail from.
		return { entries: [] };
	}

	const { listAuditLog } = await import('$lib/server/services/audit-log');
	const entries = await listAuditLog();

	return {
		entries: entries.map((entry) => ({
			id: entry.id,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			metadata: entry.metadata,
			createdAt: entry.createdAt.toISOString(),
			admin: entry.admin ? { id: entry.admin.id, email: entry.admin.email } : null,
		})),
	};
};

import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { getContactSubmissionById, updateDemande } from '$lib/server/services/contact';
import { recordAuditLog } from '$lib/server/services/audit-log';
import { logger } from '$lib/server/logger';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);
	try {
		const demande = await getContactSubmissionById(params.id);
		// Honeypot-flagged submissions are invisible in the inbox (issue 069).
		if (demande.honeypot && demande.honeypot.trim() !== '') {
			throw error(404, 'Demande introuvable');
		}
		return { demande };
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		logger.error({ err }, 'Failed to load demande');
		throw error(404, 'Demande introuvable');
	}
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const admin = locals.user!;
		const formData = await request.formData();
		const before = await getContactSubmissionById(params.id);

		try {
			const demande = await updateDemande(params.id, {
				status: formData.get('status'),
				adminNote: formData.get('adminNote'),
			});

			await recordAuditLog({
				adminId: admin.id,
				action: 'demande.update',
				entityType: 'contact_submission',
				entityId: params.id,
				// The note's text is private; the audit entry only records the change.
				metadata: {
					before: { status: before.status, hadNote: before.adminNote !== null },
					after: { status: demande.status, hadNote: demande.adminNote !== null }
				}
			});

			return { success: true, demande };
		} catch (err) {
			logger.error({ err }, 'Failed to update demande');
			return { success: false, error: 'Impossible d’enregistrer la demande.' };
		}
	},
};

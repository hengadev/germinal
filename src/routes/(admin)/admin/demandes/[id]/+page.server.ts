import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { getContactSubmissionById, updateDemande, createEventFromDemande, CreateEventFromDemandeError } from '$lib/server/services/contact';
import { getEventById } from '$lib/server/services/events';
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
		// The Event created from this Demande (issue 070), for the link to its editor.
		const linkedEvent = demande.eventId
			? await getEventById(demande.eventId, { withInternalNotes: false }).catch(() => null)
			: null;
		return { demande, linkedEvent };
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		logger.error({ err }, 'Failed to load demande');
		throw error(404, 'Demande introuvable');
	}
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		requireAdmin(locals);
		const admin = locals.user!;
		const formData = await request.formData();

		try {
			const before = await getContactSubmissionById(params.id);
			if (before.honeypot && before.honeypot.trim() !== '') {
				return fail(404, { success: false, error: 'Demande introuvable.' });
			}
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
			return fail(400, { success: false, error: 'Impossible d’enregistrer la demande.' });
		}
	},

	// « Créer l'événement » (issue 070): a privatisation Demande becomes a
	// Draft Event and the Admin lands in its editor.
	createEvent: async ({ locals, params }) => {
		requireAdmin(locals);
		const admin = locals.user!;

		let eventId: string;
		try {
			const { event, created } = await createEventFromDemande(params.id);
			eventId = event.id;

			if (created) {
				await recordAuditLog({
					adminId: admin.id,
					action: 'demande.create_event',
					entityType: 'contact_submission',
					entityId: params.id,
					// The request's details live in the Event's Internal Notes.
					metadata: { eventId: event.id }
				});
			}
		} catch (err) {
			if (err instanceof CreateEventFromDemandeError) {
				return fail(err.status, { success: false, error: err.message });
			}
			logger.error({ err }, 'Failed to create event from demande');
			return fail(400, { success: false, error: 'Impossible de créer l\u2019événement.' });
		}
		// Outside the try: redirect() throws, and the catch would take it for
		// a failure.
		redirect(303, `/admin/events/${eventId}`);
	},
};

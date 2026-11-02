import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { getGuest } from '$lib/server/services/guest-summary';
import {
	guestAuditId,
	parseTags,
	saveGuestNotes,
	tagSuggestions
} from '$lib/server/services/guest-notes';
import { recordAuditLog } from '$lib/server/services/audit-log';
import { eraseGuest } from '$lib/server/services/guest-erasure';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);
	const guest = await getGuest(params.key);
	if (!guest) error(404, 'Client introuvable');
	return { guest, tagSuggestions: await tagSuggestions() };
};

export const actions: Actions = {
	// Save the private note and the tags together. Admin-only, and the
	// audit entry never holds the note's text.
	save: async ({ locals, params, request }) => {
		requireAdmin(locals);
		const adminId = locals.user!.id;
		const guest = await getGuest(params.key);
		if (!guest) return fail(404, { error: 'Client introuvable' });

		const form = await request.formData();
		const note = String(form.get('note') ?? '');
		const tags = parseTags(String(form.get('tags') ?? ''));

		const result = await saveGuestNotes(guest.email, { note, tags }, adminId);
		if (!result.ok) return fail(400, { error: result.error, note, tags });

		await recordAuditLog({
			adminId,
			action: 'guest.notes.update',
			entityType: 'guest',
			// A hash: the URL key decodes back to the email.
			entityId: guestAuditId(guest.email),
			metadata: { tagCount: tags.length, noteCleared: note.trim().length === 0 }
		});
		return { success: true, note: undefined, tags: undefined };
	},

	// RGPD erasure request (issue 055): anonymise every Reservation with
	// that email, clear the Dietary Requirements, delete the note-and-tags
	// row, the subscriber row and the waitlist entries — all in one
	// transaction. The audit entry holds counts only, never the email.
	erase: async ({ locals, params }) => {
		requireAdmin(locals);
		const adminId = locals.user!.id;
		const guest = await getGuest(params.key);
		if (!guest) return fail(404, { error: 'Client introuvable' });

		const result = await eraseGuest(guest.email);
		if (!result.ok) return fail(409, { eraseError: result.error });

		await recordAuditLog({
			adminId,
			action: 'guest.erase',
			entityType: 'guest',
			// A hash: the log must outlive the erasure it records.
			entityId: guestAuditId(guest.email),
			metadata: result.counts
		});
		redirect(303, '/admin/clients?erased=1');
	}
};

import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { getGuest } from '$lib/server/services/guest-summary';
import {
	parseTags,
	saveGuestNotes,
	tagSuggestions
} from '$lib/server/services/guest-notes';
import { recordAuditLog } from '$lib/server/services/audit-log';

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
			// The URL-safe Guest key, not the raw email.
			entityId: params.key,
			metadata: { tagCount: tags.length, noteCleared: note.trim().length === 0 }
		});
		return { success: true, note: undefined, tags: undefined };
	}
};

import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { cancelGiftCard, extendGiftCard, getGiftCard } from '$lib/server/services/gift-cards';
import { recordAuditLog } from '$lib/server/services/audit-log';
import { maskGiftCardCode } from '$lib/utils/gift-card';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);
	const result = await getGiftCard(params.id);
	if (!result) error(404, 'Carte introuvable');
	return result;
};

export const actions: Actions = {
	// « Prolonger » : move the expiry (default one year from today).
	extend: async ({ locals, params, request }) => {
		requireAdmin(locals);
		const form = await request.formData();
		const expiryParam = String(form.get('expiresAt') ?? '').trim();
		if (expiryParam === '')
			return fail(400, { extendError: 'Date d’expiration requise.' });
		const expiresAt = new Date(`${expiryParam}T12:00:00`);
		if (Number.isNaN(expiresAt.getTime()))
			return fail(400, { extendError: 'Date d’expiration invalide.' });

		const result = await extendGiftCard(params.id, expiresAt);
		if (!result.ok) return fail(400, { extendError: result.error });
		await recordAuditLog({
			adminId: locals.user!.id,
			action: 'gift_card.extend',
			entityType: 'gift_card',
			entityId: result.card.id,
			metadata: { code: maskGiftCardCode(result.card.code), expiresAt: expiresAt.toISOString() }
		});
		return { extendSuccess: true };
	},

	// « Annuler » : status cancelled, ledger kept, audit with masked code.
	cancel: async ({ locals, params }) => {
		requireAdmin(locals);
		const result = await cancelGiftCard(params.id, locals.user!.id);
		if (!result.ok) return fail(400, { cancelError: result.error });
		return { cancelSuccess: true };
	}
};

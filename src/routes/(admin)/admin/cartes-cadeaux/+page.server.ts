import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import {
	issueGiftCard,
	listGiftCards,
	type GiftCardStatusFilter
} from '$lib/server/services/gift-cards';
import { sendGiftCardEmail } from '$lib/server/services/email';
import { recordAuditLog } from '$lib/server/services/audit-log';
import { formatGiftCardCode, maskGiftCardCode } from '$lib/utils/gift-card';
import { parseAmountInput } from '$lib/utils/currency';

const STATUSES: GiftCardStatusFilter[] = ['active', 'used_up', 'expired', 'cancelled', 'all'];

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const search = url.searchParams.get('search')?.trim() ?? '';
	const statusParam = url.searchParams.get('status') ?? '';
	const status = STATUSES.includes(statusParam as GiftCardStatusFilter)
		? (statusParam as GiftCardStatusFilter)
		: undefined;
	const cards = await listGiftCards({ search, status });
	const issued = url.searchParams.get('issued') === '1';
	return { cards, search, status: statusParam, issued };
};

export const actions: Actions = {
	// « Émettre une carte » : issue a card by hand, queue the card email,
	// audit with the masked code only.
	issue: async ({ locals, request }) => {
		requireAdmin(locals);
		const adminId = locals.user!.id;
		const form = await request.formData();
		// « 20,50 » as well as « 20.50 ».
		const parsed = parseAmountInput(form.get('amount'));
		const amount = 'cents' in parsed ? parsed.cents : NaN;
		const recipientName = String(form.get('recipientName') ?? '').trim();
		const recipientEmail = String(form.get('recipientEmail') ?? '').trim();
		const message = String(form.get('message') ?? '').trim();
		const expiryParam = String(form.get('expiresAt') ?? '').trim();
		const expiresAt = expiryParam !== '' ? new Date(`${expiryParam}T12:00:00`) : undefined;

		if (!Number.isFinite(amount) || amount <= 0)
			return fail(400, { issueError: 'Montant invalide.', recipientName, recipientEmail, message, expiresAt: expiryParam });
		if (recipientName === '' || recipientEmail === '')
			return fail(400, { issueError: 'Nom et email du destinataire requis.', recipientName, recipientEmail, message, expiresAt: expiryParam });
		if (expiresAt && Number.isNaN(expiresAt.getTime()))
			return fail(400, { issueError: 'Date d’expiration invalide.', recipientName, recipientEmail, message, expiresAt: expiryParam });

		const card = await issueGiftCard({
			amount,
			expiresAt,
			recipientName,
			recipientEmail: recipientEmail || null,
			message: message || null,
			buyerName: recipientName,
			buyerEmail: recipientEmail || null,
			origin: 'admin'
		});

		await sendGiftCardEmail({
			recipientEmail: card.recipientEmail,
			recipientName: card.recipientName,
			code: formatGiftCardCode(card.code),
			amount: card.initialAmount,
			expiry: card.expiresAt,
			message: card.message
		});

		await recordAuditLog({
			adminId,
			action: 'gift_card.issue',
			entityType: 'gift_card',
			entityId: card.id,
			metadata: {
				code: maskGiftCardCode(card.code),
				amount: card.initialAmount,
				origin: 'admin'
			}
		});

		return { success: true, issuedCode: formatGiftCardCode(card.code) };
	}
};

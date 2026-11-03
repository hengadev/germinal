import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getGiftCard } from '$lib/server/services/gift-cards';
import { formatGiftCardCode } from '$lib/utils/gift-card';

/**
 * The printable card (issue 064): keyed by the card's UUID, which is
 * unguessable, and still noindexed. Only an active, unexpired card renders
 * in full; anything else gets a plain message and no details.
 */
export const load: PageServerLoad = async ({ params }) => {
	const id = params.id;
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
		throw error(404, 'Carte inconnue.');
	}

	const result = await getGiftCard(id);
	if (!result) throw error(404, 'Carte inconnue.');
	const { card } = result;

	const usable =
		card.status === 'active' && card.expiresAt.getTime() > Date.now();
	if (!usable) return { card: null };

	return {
		card: {
			code: formatGiftCardCode(card.code),
			amount: card.initialAmount,
			expiresAt: card.expiresAt,
			message: card.message,
			recipientName: card.recipientName
		}
	};
};

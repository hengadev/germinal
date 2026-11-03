import type { PageServerLoad } from './$types';
import { findGiftCardByStripeReference } from '$lib/server/services/gift-cards';

/**
 * The success page after Stripe: says where the card was sent. It never
 * shows the code — the card email and the buyer receipt carry the details.
 * If the webhook has not issued the card yet, a neutral message shows.
 */
export const load: PageServerLoad = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');
	if (!sessionId) return { delivery: null as null | 'buyer' | 'recipient', buyerEmail: null, recipientEmail: null };

	const card = await findGiftCardByStripeReference(sessionId);
	if (!card) {
		return { delivery: null, buyerEmail: null, recipientEmail: null };
	}
	const delivery: 'buyer' | 'recipient' = card.recipientEmail ? 'recipient' : 'buyer';
	return {
		delivery,
		buyerEmail: card.buyerEmail,
		recipientEmail: delivery === 'recipient' ? card.recipientEmail : null
	};
};

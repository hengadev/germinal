import { json, type RequestHandler } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/rate-limit';
import { findUsableGiftCard } from '$lib/server/services/gift-cards';
import { logger } from '$lib/server/logger';

/** A gift card's usability, for the booking form's live validation (issue
 * 065). The reason is translated on the client; the balance is what the
 * card can pay toward the Deposit. */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();

	// Rate limit: the gift-card-validation policy allows 30 attempts per
	// minute per client IP, like promo-code validation.
	const decision = await checkRateLimit('gift-card-validation', ip);
	if (decision.status === 'unavailable') {
		logger.error('Rate limiter unavailable, rejecting gift card validation');
		return json({ valid: false, reason: 'unavailable' }, { status: 503 });
	}
	if (decision.status === 'denied') {
		return json(
			{ valid: false, reason: 'rate_limited' },
			{ status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } }
		);
	}

	const code = url.searchParams.get('code')?.trim();
	if (!code) {
		return json({ valid: false, reason: 'unknown' }, { status: 400 });
	}

	const result = await findUsableGiftCard(code);

	if (!result.ok) {
		return json({ valid: false, reason: result.reason });
	}

	return json({
		valid: true,
		code: result.card.code,
		balance: result.card.balance,
		currency: 'EUR',
	});
};

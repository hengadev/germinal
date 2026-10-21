import { json, type RequestHandler } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/rate-limit';
import { validatePromoCode } from '$lib/server/services/promo-codes';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();

	// Rate limit: the promo-code-validation policy allows 30 attempts per
	// minute per client IP.
	const decision = await checkRateLimit('promo-code-validation', ip);
	if (decision.status === 'unavailable') {
		logger.error('Rate limiter unavailable, rejecting promo code validation');
		return json({ valid: false, error: 'Service temporarily unavailable.' }, { status: 503 });
	}
	if (decision.status === 'denied') {
		return json(
			{ valid: false, error: `Too many attempts. Please try again in ${Math.ceil(decision.retryAfterSeconds / 60)} minute(s).` },
			{ status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } }
		);
	}

	const code = url.searchParams.get('code')?.trim();
	const sessionId = url.searchParams.get('sessionId')?.trim();

	if (!code || !sessionId) {
		return json({ valid: false, error: 'Missing code or sessionId' }, { status: 400 });
	}

	const result = await validatePromoCode(code, sessionId);

	if (!result.valid) {
		return json({ valid: false, error: result.error });
	}

	return json({
		valid: true,
		discountType: result.discountType,
		discountValue: result.discountValue,
		currency: result.currency,
	});
};

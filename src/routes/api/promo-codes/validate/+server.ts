import { json, type RequestHandler } from '@sveltejs/kit';
import { createRateLimiter, RateLimitUnavailableError } from '$lib/server/rate-limit';
import { validatePromoCode } from '$lib/server/services/promo-codes';
import { logger } from '$lib/server/logger';

// 30 validation attempts per minute per IP
const promoCodeRateLimiter = createRateLimiter('promo-code', { maxAttempts: 30, windowMs: 60 * 1000 });

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	const ip = getClientAddress();

	let allowed: boolean;
	try {
		allowed = await promoCodeRateLimiter.check(ip);
	} catch (err) {
		if (err instanceof RateLimitUnavailableError) {
			logger.error({ err }, 'Rate limiter unavailable, rejecting promo code validation');
			return json({ valid: false, error: 'Service temporarily unavailable.' }, { status: 503 });
		}
		throw err;
	}
	if (!allowed) {
		return json({ valid: false, error: 'Too many attempts. Please try again later.' }, { status: 429 });
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

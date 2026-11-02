import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { logger } from '$lib/server/logger';
import { subscribeFromForm } from '$lib/server/services/subscribers';
import { sendNewsletterConfirmationEmail } from '$lib/server/services/email';
import { checkRateLimit } from '$lib/server/rate-limit';
import { validateCsrfToken } from '$lib/server/csrf';
import type { RequestHandler } from './$types';

const signupSchema = z.object({
	email: z.string().min(3).max(320),
	locale: z.enum(['fr', 'en']).default('en'),
	consent: z.literal(true)
});

/**
 * Newsletter signup (issue 053), double opt-in. The answer never reveals
 * whether the address is known: the same success is returned for a new
 * address, a duplicate and an already-subscribed one.
 */
export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	const ip = getClientAddress();

	if (!validateCsrfToken(request, locals.csrfToken)) {
		return json({ error: 'Invalid CSRF token' }, { status: 403 });
	}

	// Rate limit: the newsletter-signup policy allows 5 signups per hour
	// per client IP — its own namespace and budget, like every other
	// Guest-facing action.
	const decision = await checkRateLimit('newsletter-signup', ip);
	if (decision.status === 'unavailable') {
		logger.error('Rate limiter unavailable, rejecting newsletter signup');
		return json({ error: 'Service temporarily unavailable. Please try again shortly.' }, { status: 503 });
	}
	if (decision.status === 'denied') {
		return json(
			{ error: `Too many attempts. Please try again in ${Math.ceil(decision.retryAfterSeconds / 60)} minutes.` },
			{ status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } }
		);
	}

	try {
		const validated = signupSchema.safeParse(await request.json());
		if (!validated.success) {
			return json({ error: 'Invalid input' }, { status: 400 });
		}

		const result = await subscribeFromForm(validated.data.email, validated.data.locale);
		if (!result.ok) {
			// Not a valid address: same neutral answer, no email.
			return json({ success: true });
		}
		if (result.sendEmail) {
			await sendNewsletterConfirmationEmail({
				email: result.email,
				locale: result.locale,
				confirmationToken: result.confirmationToken,
			});
		}
		return json({ success: true });
	} catch (error) {
		logger.error({ err: error }, 'Newsletter signup error');
		return json({ error: 'Failed to sign up' }, { status: 500 });
	}
};

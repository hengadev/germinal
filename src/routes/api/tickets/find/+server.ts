import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { findTicketSchema } from '$lib/server/validators/find-ticket';
import { resendTicketsForEmail } from '$lib/server/services/reservations';
import { strictRateLimiter } from '$lib/server/rate-limit';
import { validateCsrfToken } from '$lib/server/csrf';
import type { RequestHandler } from './$types';

/**
 * Same response body regardless of whether a matching Reservation was
 * found — this is a deliberate anti-enumeration measure. Do not branch
 * this response on lookup results.
 */
const GENERIC_RESPONSE = {
	success: true,
	message:
		"If that email has any confirmed reservations, we've sent the ticket link(s) to it.",
};

export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	const ip = getClientAddress();

	// CSRF validation
	if (!validateCsrfToken(request, locals.csrfToken)) {
		return json({ error: 'Invalid CSRF token' }, { status: 403 });
	}

	// Rate limiting — same limiter/config used by the other public
	// Guest-facing endpoints (contact form, waitlist join): 3 attempts/hour/IP.
	if (!strictRateLimiter.check(ip)) {
		return json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
	}

	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const validated = findTicketSchema.safeParse(data);

	if (!validated.success) {
		return json(
			{ error: 'Invalid input', details: validated.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	try {
		// resendTicketsForEmail never throws for "not found" and never reveals
		// whether it found anything — the response below is identical either way.
		await resendTicketsForEmail(validated.data.email);
	} catch (error) {
		logger.error({ err: error }, 'Find-ticket lookup error');
		// Still fall through to the generic response — do not leak failure detail.
	}

	return json(GENERIC_RESPONSE);
};

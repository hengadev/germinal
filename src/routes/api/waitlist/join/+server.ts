import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { z } from 'zod';
import { joinWaitlist, WaitlistNotAvailableError } from '$lib/server/services/waitlist';
import { checkRateLimit } from '$lib/server/rate-limit';
import { validateCsrfToken } from '$lib/server/csrf';
import type { RequestHandler } from './$types';

const joinWaitlistSchema = z.object({
	sessionId: z.string().uuid(),
	email: z.string().email().toLowerCase(),
	name: z.string().min(1).max(255),
	phone: z.string().optional(),
	quantity: z.number().int().min(1).max(10),
	notificationPreference: z.enum(['email', 'sms', 'both']).default('both')
});

export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	const ip = getClientAddress();

	// CSRF validation
	if (!validateCsrfToken(request, locals.csrfToken)) {
		return json(
			{ error: 'Invalid CSRF token' },
			{ status: 403 }
		);
	}

	// Rate limit: the waitlist-join policy allows 3 joins per hour per
	// client IP — its own namespace and budget, independent of every other
	// Guest-facing action.
	const decision = await checkRateLimit('waitlist-join', ip);
	if (decision.status === 'unavailable') {
		logger.error('Rate limiter unavailable, rejecting waitlist join');
		return json(
			{ error: 'Service temporarily unavailable. Please try again shortly.' },
			{ status: 503 }
		);
	}
	if (decision.status === 'denied') {
		return json(
			{ error: `Too many attempts. Please try again in ${Math.ceil(decision.retryAfterSeconds / 60)} minutes.` },
			{ status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } }
		);
	}

	try {
		const data = await request.json();
		const validated = joinWaitlistSchema.safeParse(data);

		if (!validated.success) {
			return json(
				{ error: 'Invalid input', details: validated.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const entry = await joinWaitlist(validated.data);

		return json(
			{ success: true, entryId: entry.id },
			{ status: 201 }
		);

	} catch (error) {
		logger.error({ err: error }, 'Waitlist join error');

		// Event access refused the Waitlist (issue 030): a Seating of an
		// unpublished Event, or an unpublished one, is simply not found.
		if (error instanceof WaitlistNotAvailableError) {
			if (error.reason === 'event-not-published' || error.reason === 'seating-unpublished') {
				return json({ error: 'Session not found' }, { status: 404 });
			}
			return json({ error: error.message }, { status: 400 });
		}

		if (error instanceof Error) {
			if (error.message.includes('already on')) {
				return json({ error: error.message }, { status: 409 });
			}
		}

		return json({ error: 'Failed to join waitlist' }, { status: 500 });
	}
};

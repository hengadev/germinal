import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { z } from 'zod';
import { joinWaitlist } from '$lib/server/services/waitlist';
import { strictRateLimiter } from '$lib/server/rate-limit';
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

	// Rate limiting
	if (!strictRateLimiter.check(ip)) {
		return json(
			{ error: 'Too many attempts. Please try again later.' },
			{ status: 429 }
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

		if (error instanceof Error) {
			if (error.message.includes('not available')) {
				return json({ error: error.message }, { status: 400 });
			}
			if (error.message.includes('already on')) {
				return json({ error: error.message }, { status: 409 });
			}
		}

		return json({ error: 'Failed to join waitlist' }, { status: 500 });
	}
};

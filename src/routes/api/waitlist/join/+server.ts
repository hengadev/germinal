import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { joinWaitlist } from '$lib/server/services/waitlist';
import { strictRateLimiter } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const joinWaitlistSchema = z.object({
	sessionId: z.string().uuid(),
	email: z.string().email().toLowerCase(),
	name: z.string().min(1).max(255),
	phone: z.string().optional(),
	quantity: z.number().int().min(1).max(10)
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();

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
		console.error('Waitlist join error:', error);

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

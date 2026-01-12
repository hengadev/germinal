import { json } from '@sveltejs/kit';
import { createReservationSchema } from '$lib/server/validators/reservations';
import { createReservation } from '$lib/server/services/reservations';
import { strictRateLimiter } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();

	// Rate limiting: 10 requests per 10 minutes
	if (!strictRateLimiter.check(ip)) {
		const resetTime = strictRateLimiter.getReset(ip);
		return json(
			{
				error: `Too many reservation attempts. Please try again in ${Math.ceil(resetTime / 60)} minutes.`,
				code: 'RATE_LIMIT_EXCEEDED',
			},
			{ status: 429 }
		);
	}

	try {
		const data = await request.json();
		const userAgent = request.headers.get('user-agent');

		// Validate input
		const validated = createReservationSchema.safeParse(data);

		if (!validated.success) {
			return json(
				{
					error: 'Invalid input',
					details: validated.error.flatten().fieldErrors,
				},
				{ status: 400 }
			);
		}

		// Create reservation with capacity lock
		const result = await createReservation({
			...validated.data,
			ipAddress: ip,
			userAgent,
		});

		return json(
			{
				reservationId: result.reservation.id,
				clientSecret: result.clientSecret,
				expiresAt: result.expiresAt,
				accessToken: result.reservation.accessToken,
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Reservation creation error:', error);

		if (error instanceof Error) {
			// Handle specific errors
			if (error.message === 'Not enough tickets available') {
				return json({ error: 'Session is sold out', code: 'SOLD_OUT' }, { status: 409 });
			}

			if (error.message === 'Session not found or not published') {
				return json({ error: 'Session not found', code: 'NOT_FOUND' }, { status: 404 });
			}

			if (error.message === 'Invalid submission') {
				return json({ error: 'Invalid submission', code: 'SPAM_DETECTED' }, { status: 400 });
			}

			if (error.message.includes('Cannot book tickets for a session that has already started')) {
				return json({ error: 'This session has already started', code: 'SESSION_STARTED' }, { status: 400 });
			}
		}

		return json({ error: 'Failed to create reservation', code: 'INTERNAL_ERROR' }, { status: 500 });
	}
};

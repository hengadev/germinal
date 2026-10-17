import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { createReservationSchema } from '$lib/server/validators/reservations';
import { createReservation, SeatingNotBookableError } from '$lib/server/services/reservations';
import { strictRateLimiter, RateLimitUnavailableError } from '$lib/server/rate-limit';
import { validateCsrfToken } from '$lib/server/csrf';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
	const ip = getClientAddress();

	// CSRF validation
	if (!validateCsrfToken(request, locals.csrfToken)) {
		return json(
			{ error: 'Invalid CSRF token', code: 'CSRF_ERROR' },
			{ status: 403 }
		);
	}

	// Rate limiting: 10 requests per 10 minutes
	let allowed: boolean;
	try {
		allowed = await strictRateLimiter.check(ip);
	} catch (err) {
		if (err instanceof RateLimitUnavailableError) {
			logger.error({ err }, 'Rate limiter unavailable, rejecting reservation creation');
			return json(
				{ error: 'Service temporarily unavailable. Please try again shortly.', code: 'RATE_LIMITER_UNAVAILABLE' },
				{ status: 503 }
			);
		}
		throw err;
	}
	if (!allowed) {
		const resetTime = await strictRateLimiter.getReset(ip);
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
			phone: validated.data.phone ?? undefined,
			ipAddress: ip,
			userAgent: userAgent ?? undefined,
		});

		return json(
			{
				reservationId: result.reservation.id,
				// null when there is no Deposit: the Reservation is already
				// confirmed and the Guest goes straight to `ticketUrl`.
				checkoutUrl: result.checkoutUrl,
				ticketUrl: `/tickets/${result.reservation.accessToken}?success=true`,
				status: result.reservation.status,
				expiresAt: result.expiresAt,
				accessToken: result.reservation.accessToken,
			},
			{ status: 201 }
		);
	} catch (error) {
		logger.error({ err: error }, 'Reservation creation error');

		// Event access refused the Seating (issue 030): a Seating of an
		// unpublished Event, or an unpublished one, is simply not found.
		if (error instanceof SeatingNotBookableError) {
			switch (error.reason) {
				case 'event-not-published':
				case 'seating-unpublished':
					return json({ error: 'Session not found', code: 'NOT_FOUND' }, { status: 404 });
				case 'not-priced':
					// The Seating's Service has no price yet (issue 022).
					return json({ error: 'This session is not open for booking yet', code: 'NOT_PRICED' }, { status: 409 });
				case 'started':
					return json({ error: 'This session has already started', code: 'SESSION_STARTED' }, { status: 400 });
				case 'full':
					return json({ error: 'Session is sold out', code: 'SOLD_OUT' }, { status: 409 });
			}
		}

		if (error instanceof Error && error.message === 'Invalid submission') {
			return json({ error: 'Invalid submission', code: 'SPAM_DETECTED' }, { status: 400 });
		}

		return json({ error: 'Failed to create reservation', code: 'INTERNAL_ERROR' }, { status: 500 });
	}
};

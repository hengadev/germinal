// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const validateCsrfToken = vi.fn();
const rateLimiterCheck = vi.fn();
const resendTicketsForEmail = vi.fn();

vi.mock('$lib/server/csrf', () => ({
	validateCsrfToken,
}));

vi.mock('$lib/server/rate-limit', () => ({
	strictRateLimiter: {
		check: rateLimiterCheck,
	},
}));

vi.mock('$lib/server/services/reservations', () => ({
	resendTicketsForEmail,
}));

function makeEvent(body: unknown) {
	return {
		request: new Request('http://x/api/tickets/find', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' },
			body: JSON.stringify(body),
		}),
		getClientAddress: () => '127.0.0.1',
		locals: { csrfToken: 'token' },
	} as any;
}

describe('POST /api/tickets/find — anti email-enumeration lookup endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		validateCsrfToken.mockReturnValue(true);
		rateLimiterCheck.mockReturnValue(true);
		resendTicketsForEmail.mockResolvedValue(undefined);
	});

	it('returns the same generic success response whether or not a reservation matched', async () => {
		const { POST } = await import('../../../src/routes/api/tickets/find/+server');

		// resendTicketsForEmail never reveals whether it found anything — it just
		// resolves either way — so both "found" and "not found" calls are
		// indistinguishable from the endpoint's perspective.
		const foundResponse = await POST(makeEvent({ email: 'has-a-reservation@example.com' }));
		const notFoundResponse = await POST(makeEvent({ email: 'no-reservation@example.com' }));

		expect(foundResponse.status).toBe(200);
		expect(notFoundResponse.status).toBe(200);

		const foundBody = await foundResponse.json();
		const notFoundBody = await notFoundResponse.json();
		expect(foundBody).toEqual(notFoundBody);
		expect(foundBody).toEqual({ success: true, message: expect.any(String) });
	});

	it('still returns the generic success response when the lookup throws internally', async () => {
		resendTicketsForEmail.mockRejectedValue(new Error('db exploded'));
		const { POST } = await import('../../../src/routes/api/tickets/find/+server');

		const response = await POST(makeEvent({ email: 'guest@example.com' }));

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ success: true, message: expect.any(String) });
	});

	it('rejects an invalid CSRF token before doing any lookup', async () => {
		validateCsrfToken.mockReturnValue(false);
		const { POST } = await import('../../../src/routes/api/tickets/find/+server');

		const response = await POST(makeEvent({ email: 'guest@example.com' }));

		expect(response.status).toBe(403);
		expect(resendTicketsForEmail).not.toHaveBeenCalled();
	});

	it('rejects when rate limited before doing any lookup', async () => {
		rateLimiterCheck.mockReturnValue(false);
		const { POST } = await import('../../../src/routes/api/tickets/find/+server');

		const response = await POST(makeEvent({ email: 'guest@example.com' }));

		expect(response.status).toBe(429);
		expect(resendTicketsForEmail).not.toHaveBeenCalled();
	});

	it('rejects an invalid email without doing any lookup', async () => {
		const { POST } = await import('../../../src/routes/api/tickets/find/+server');

		const response = await POST(makeEvent({ email: 'not-an-email' }));

		expect(response.status).toBe(400);
		expect(resendTicketsForEmail).not.toHaveBeenCalled();
	});

	it('rejects a honeypot-filled submission without doing any lookup', async () => {
		const { POST } = await import('../../../src/routes/api/tickets/find/+server');

		const response = await POST(
			makeEvent({ email: 'guest@example.com', honeypot: 'http://spam.example.com' })
		);

		expect(response.status).toBe(400);
		expect(resendTicketsForEmail).not.toHaveBeenCalled();
	});
});

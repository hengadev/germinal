import { redirect, fail, type Actions } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, verifyPasswordMock } from '$lib/server/auth';
import { createSession } from '$lib/server/session';
import { env } from '$lib/server/env';
import { checkRateLimit, resetRateLimit, getRateLimitReset } from '$lib/server/rate-limit';
import type { PageServerLoad } from './$types';

// Redirect to /admin if already logged in
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/admin');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		// Get client IP for rate limiting
		const ip = getClientAddress();

		// Check rate limit
		if (!checkRateLimit(ip)) {
			const resetTime = getRateLimitReset(ip);
			return fail(429, {
				error: `Too many login attempts. Try again in ${resetTime} seconds.`,
				rateLimited: true
			});
		}

		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');

		// Validate input
		if (!email || typeof email !== 'string') {
			return fail(400, { error: 'Email is required' });
		}

		if (!password || typeof password !== 'string') {
			return fail(400, { error: 'Password is required' });
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode: simple credential check
			const validPassword = await verifyPasswordMock(email, password);

			if (!validPassword) {
				return fail(400, { error: 'Invalid email or password' });
			}

			// Reset rate limit on successful login
			resetRateLimit(ip);

			// Create session (uses email as userId in mock mode)
			const session = await createSession(email);

			// Set secure cookie
			cookies.set('session', session.id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: true,
				maxAge: 60 * 60 * 24 * 7 // 7 days
			});

			// Redirect to admin dashboard
			throw redirect(302, '/admin');
		}

		// Database mode: verify against database
		const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

		if (!user) {
			return fail(400, { error: 'Invalid email or password' });
		}

		// Verify password
		const validPassword = await verifyPassword(user.passwordHash, password);

		if (!validPassword) {
			return fail(400, { error: 'Invalid email or password' });
		}

		// Reset rate limit on successful login
		resetRateLimit(ip);

		// Create session
		const session = await createSession(user.id);

		// Set secure cookie
		cookies.set('session', session.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 60 * 60 * 24 * 7 // 7 days
		});

		// Redirect to admin dashboard
		throw redirect(302, '/admin');
	}
};

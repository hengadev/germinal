import { redirect, fail, error, type Actions } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, verifyPasswordMock, getMockCredentials } from '$lib/server/auth';
import { createSession } from '$lib/server/session';
import { env } from '$lib/server/env';
import { checkRateLimit, resetRateLimit, getRateLimitReset } from '$lib/server/rate-limit';
import { getCookieDomain, getSessionCookieName } from '$lib/server/hostname';
import type { PageServerLoad } from './$types';

// Redirect to /admin if already logged in
export const load: PageServerLoad = async ({ locals }) => {
	// SECURITY: Login only accessible from admin or staff subdomain
	if (!locals.isAdminDomain && !locals.isStaffDomain) {
		throw error(404, 'Not Found');
	}

	if (locals.user) {
		const redirectPath = locals.user.role === 'staff' ? '/staff' : '/admin';
		throw redirect(302, redirectPath);
	}

	const showMockCredentials = env.USE_MOCK_DATA;
	const mockCredentials = showMockCredentials ? getMockCredentials() : [];

	return {
		showMockCredentials,
		mockCredentials,
		csrfToken: locals.csrfToken
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, locals, url }) => {
		// SECURITY: Login only accessible from admin or staff subdomain
		if (!locals.isAdminDomain && !locals.isStaffDomain) {
			throw error(404, 'Not Found');
		}

		// Get client IP for rate limiting
		const ip = getClientAddress();
		const cookieDomain = getCookieDomain(url.hostname);
		const sessionCookieName = getSessionCookieName(url.hostname);

		// Check rate limit
		if (!checkRateLimit(ip)) {
			const resetTime = getRateLimitReset(ip);
			return fail(429, {
				error: `Trop de tentatives de connexion. Réessayez dans ${resetTime} secondes.`,
				rateLimited: true
			});
		}

		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');

		// Validate input
		if (!email || typeof email !== 'string') {
			return fail(400, { error: "L'email est requis" });
		}

		if (!password || typeof password !== 'string') {
			return fail(400, { error: 'Le mot de passe est requis' });
		}

		if (env.USE_MOCK_DATA) {
			const role = await verifyPasswordMock(email, password);

			if (!role) {
				return fail(400, { error: "Email ou mot de passe invalide" });
			}

			resetRateLimit(ip);

			const session = await createSession(email, role);

			cookies.set(sessionCookieName, session.id, {
				path: '/',
				domain: cookieDomain ?? undefined,
				httpOnly: true,
				sameSite: 'lax',
				secure: true,
				maxAge: 60 * 60 * 24 * 7
			});

			throw redirect(302, role === 'staff' ? '/staff' : '/admin');
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

		// Set secure cookie with subdomain support
		cookies.set(sessionCookieName, session.id, {
			path: '/',
			domain: cookieDomain ?? undefined,
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 60 * 60 * 24 * 7 // 7 days
		});

		// Redirect based on user role
		const redirectPath = user.role === 'staff' ? '/staff' : '/admin';
		throw redirect(302, redirectPath);
	}
};

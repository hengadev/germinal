import type { Handle, HandleServerError } from '@sveltejs/kit';
import crypto from 'crypto';
import { validateSession, deleteExpiredSessions } from '$lib/server/session';
import { isAdminDomain, getCookieDomain } from '$lib/server/hostname';
import { initJobScheduler, stopJobScheduler } from '$lib/server/jobs/scheduler';
import { initMonitoring, captureException } from '$lib/server/monitoring';
import { logger } from '$lib/server/logger';
import { generateToken } from '$lib/server/csrf';

/**
 * Generate a cryptographically secure nonce for CSP
 */
function generateNonce(): string {
	return crypto.randomBytes(16).toString('base64');
}

// Initialize monitoring
initMonitoring();

// Initialize job scheduler on startup
if (typeof setInterval !== 'undefined') {
	initJobScheduler().catch((error) => {
		logger.error({ err: error }, '[Job Scheduler] Failed to initialize');
		// Continue without job scheduler - system will still work
	});
}

// Graceful shutdown handlers
if (typeof process !== 'undefined') {
	process.on('SIGTERM', async () => {
		logger.info('SIGTERM received, shutting down gracefully...');
		await stopJobScheduler();
		process.exit(0);
	});

	process.on('SIGINT', async () => {
		logger.info('SIGINT received, shutting down gracefully...');
		await stopJobScheduler();
		process.exit(0);
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	// Detect hostname and set domain context
	const hostname = event.url.hostname;
	event.locals.isAdminDomain = isAdminDomain(hostname);
	const cookieDomain = getCookieDomain(hostname) ?? undefined;

	// Generate and store CSRF token for session
	const csrfToken = generateToken();
	event.locals.csrfToken = csrfToken;

	// Generate nonce for CSP
	const nonce = generateNonce();

	// Store CSRF token in httpOnly cookie for API validation
	event.cookies.set('csrf_token', csrfToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/',
		domain: cookieDomain
	});

	// Read session cookie
	const sessionId = event.cookies.get('session');

	// Initialize user as null
	event.locals.user = null;

	// If session cookie exists, validate it
	if (sessionId) {
		const user = await validateSession(sessionId);
		if (user) {
			event.locals.user = user;
		} else {
			// Invalid/expired session - clear the cookie with correct domain
			event.cookies.delete('session', {
				path: '/',
				domain: cookieDomain
			});
		}
	}

	// Build Content Security Policy
	const isDevelopment = process.env.NODE_ENV !== 'production';
	const csp = isDevelopment
		? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:"
		: `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com https://js.stripe.com; frame-src https://js.stripe.com`;

	// Continue with request, injecting nonce into HTML
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// Replace %sveltekit.nonce% placeholder with actual nonce
			return html.replace(/%sveltekit\.nonce%/g, nonce);
		}
	});

	// Set Content Security Policy header
	response.headers.set('Content-Security-Policy', csp);

	return response;
};

export const handleError: HandleServerError = (({ error, event }) => {
	// Log to our structured logger
	logger.error({
		err: {
			type: error instanceof Error ? error.name : 'Unknown',
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		},
		url: event?.url?.href,
		method: event?.request?.method,
	},
	'Server error occurred'
	);

	// Send to Sentry for production error tracking
	if (error instanceof Error) {
		captureException(error, {
			url: event?.url?.href,
			method: event?.request?.method,
		});
	}

	return {
		message: 'An unexpected error occurred',
		code: error instanceof Error ? error.name : 'UNKNOWN',
	};
}) satisfies HandleServerError;

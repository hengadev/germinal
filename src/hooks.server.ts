import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateSession, deleteExpiredSessions } from '$lib/server/session';
import { isAdminDomain, getCookieDomain } from '$lib/server/hostname';
import { initJobScheduler, stopJobScheduler } from '$lib/server/jobs/scheduler';
import { runMigrations } from '$lib/server/db';
import { initMonitoring, captureException } from '$lib/server/monitoring';
import { logger } from '$lib/server/logger';
import { generateToken } from '$lib/server/csrf';

// Initialize monitoring
initMonitoring();

// Run migrations then initialize job scheduler on startup
if (typeof setInterval !== 'undefined') {
	runMigrations()
		.then(() => initJobScheduler())
		.catch((error) => {
			logger.error({ err: error }, '[Startup] Failed during migrations or job scheduler init');
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

	// On the admin subdomain (not localhost), redirect bare root to /admin so the auth flow runs
	const isLocalhost = hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1');
	if (event.locals.isAdminDomain && !isLocalhost && event.url.pathname === '/') {
		throw redirect(302, '/admin');
	}

	// Maintenance mode: redirect all public traffic to the maintenance page
	const maintenanceMode = process.env.MAINTENANCE_MODE === 'true';
	if (maintenanceMode && !event.locals.isAdminDomain && event.url.pathname !== '/maintenance') {
		throw redirect(302, '/maintenance');
	}

	// Reuse the existing CSRF token from the cookie if present; otherwise generate a new one.
	// Regenerating on every request breaks validation because API calls arrive with the token
	// from the page load, not the newly-generated one for that request.
	const existingCsrfToken = event.cookies.get('csrf_token');
	const csrfToken = existingCsrfToken || generateToken();
	event.locals.csrfToken = csrfToken;

	// Store CSRF token in httpOnly cookie for API validation
	if (!existingCsrfToken) {
		event.cookies.set('csrf_token', csrfToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			path: '/',
			domain: cookieDomain
		});
	}

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

	const response = await resolve(event);

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

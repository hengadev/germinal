import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateSession, deleteExpiredSessions } from '$lib/server/session';
import { isAdminDomain, isStaffDomain, getCookieDomain, getSessionCookieName, getCsrfCookieName } from '$lib/server/hostname';
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
	event.locals.isStaffDomain = isStaffDomain(hostname);
	const cookieDomain = getCookieDomain(hostname) ?? undefined;
	const sessionCookieName = getSessionCookieName(hostname);
	const csrfCookieName = getCsrfCookieName(hostname);

	// Determine the correct PWA icon for iOS based on domain
	const isAdminOrStaff = event.locals.isAdminDomain || event.locals.isStaffDomain;
	const appleTouchIcon = isAdminOrStaff ? '/pwa-admin-192x192.png' : '/pwa-192x192.png';
	const appleTouchTitle = event.locals.isAdminDomain ? 'Germinal Admin' : (event.locals.isStaffDomain ? 'Germinal Staff' : 'Germinal');
	const themeColor = isAdminOrStaff ? '#1a1a1a' : '#ffffff';

	// On the admin subdomain (not localhost), redirect bare root to /admin so the auth flow runs
	const isLocalhost = hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1');
	if (event.locals.isAdminDomain && !isLocalhost && event.url.pathname === '/') {
		throw redirect(302, '/admin');
	}

	// On the staff subdomain (not localhost), redirect bare root to /staff so the auth flow runs
	if (event.locals.isStaffDomain && !isLocalhost && event.url.pathname === '/') {
		throw redirect(302, '/staff');
	}

	// Maintenance mode: redirect all public traffic to the maintenance page
	const maintenanceMode = process.env.MAINTENANCE_MODE === 'true';
	if (maintenanceMode && !event.locals.isAdminDomain && !event.locals.isStaffDomain && event.url.pathname !== '/maintenance') {
		throw redirect(302, '/maintenance');
	}

	// Reuse the existing CSRF token from the cookie if present; otherwise generate a new one.
	// Regenerating on every request breaks validation because API calls arrive with the token
	// from the page load, not the newly-generated one for that request.
	const existingCsrfToken = event.cookies.get(csrfCookieName);
	const csrfToken = existingCsrfToken || generateToken();
	event.locals.csrfToken = csrfToken;

	// Store CSRF token in httpOnly cookie for API validation
	if (!existingCsrfToken) {
		event.cookies.set(csrfCookieName, csrfToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			path: '/',
			domain: cookieDomain
		});
	}

	// Read session cookie
	const sessionId = event.cookies.get(sessionCookieName);

	// Initialize user as null
	event.locals.user = null;

	// If session cookie exists, validate it
	if (sessionId) {
		const user = await validateSession(sessionId);
		if (user) {
			event.locals.user = user;
		} else {
			// Invalid/expired session - clear the cookie with correct domain
			event.cookies.delete(sessionCookieName, {
				path: '/',
				domain: cookieDomain
			});
		}
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// Replace apple-touch-icon href with domain-specific icon
			return html
				.replace(
					/<link rel="apple-touch-icon" href="\/pwa-192x192\.png" \/>/,
					`<link rel="apple-touch-icon" href="${appleTouchIcon}" />`
				)
				.replace(
					/<meta name="theme-color" content="#ffffff" \/>/,
					`<meta name="theme-color" content="${themeColor}" />`
				)
				.replace(
					/<meta name="apple-mobile-web-app-title" content="Germinal" \/>/,
					`<meta name="apple-mobile-web-app-title" content="${appleTouchTitle}" />`
				);
		}
	});

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

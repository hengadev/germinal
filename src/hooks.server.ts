import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateSession, deleteExpiredSessions } from '$lib/server/session';
import { isAdminDomain, getCookieDomain } from '$lib/server/hostname';
import { initJobScheduler, stopJobScheduler } from '$lib/server/jobs/scheduler';
import { initMonitoring, captureException } from '$lib/server/monitoring';
import { logger } from '$lib/server/logger';

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
		console.log('SIGTERM received, shutting down gracefully...');
		await stopJobScheduler();
		process.exit(0);
	});

	process.on('SIGINT', async () => {
		console.log('SIGINT received, shutting down gracefully...');
		await stopJobScheduler();
		process.exit(0);
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	// Detect hostname and set domain context
	const hostname = event.url.hostname;
	event.locals.isAdminDomain = isAdminDomain(hostname);
	const cookieDomain = getCookieDomain(hostname);

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

	// Continue with request
	return resolve(event);
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

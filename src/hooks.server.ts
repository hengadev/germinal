import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateSession, deleteExpiredSessions } from '$lib/server/session';

// Session cleanup: Run every hour to remove expired sessions
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

if (typeof setInterval !== 'undefined') {
	setInterval(() => {
		deleteExpiredSessions()
			.then((deleted) => {
				if (deleted > 0) {
					console.log(`[Session Cleanup] Removed ${deleted} expired sessions`);
				}
			})
			.catch((error) => {
				console.error('[Session Cleanup] Error deleting expired sessions:', error);
			});
	}, CLEANUP_INTERVAL_MS);

	console.log('[Session Cleanup] Scheduled to run every hour');
}

export const handle: Handle = async ({ event, resolve }) => {
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
			// Invalid/expired session - clear the cookie
			event.cookies.delete('session', { path: '/' });
		}
	}

	// Continue with request
	return resolve(event);
};

export const handleError: HandleServerError = (({ error }) => {
  console.error('Server error:', error);

  return {
    message: 'An unexpected error occurred',
    code: error instanceof Error ? error.name : 'UNKNOWN',
  };
}) satisfies HandleServerError;

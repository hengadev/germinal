import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateSession } from '$lib/server/session';

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

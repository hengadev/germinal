import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Require authenticated user
 * Throws 401 if not authenticated
 */
export function requireAuth(event: RequestEvent) {
	if (!event.locals.user) {
		throw error(401, 'Unauthorized - Authentication required');
	}
	return event.locals.user;
}

/**
 * Require admin role
 * Throws 401 if not authenticated, 403 if not admin
 */
export function requireAdmin(event: RequestEvent) {
	const user = requireAuth(event);

	if (user.role !== 'admin') {
		throw error(403, 'Forbidden - Admin access required');
	}

	return user;
}

import { error } from '@sveltejs/kit';
import type { Locals } from '$lib/types';
import { logger } from '$lib/server/logger';

/**
 * Check if the current user has admin or staff role
 * @param locals - The SvelteKit locals object containing the user
 * @throws 403 error if user is not authenticated or not an admin/staff
 */
export function requireStaff(locals: Locals) {
	if (!locals.user) {
		logger.warn('Unauthorized access attempt to staff route');
		throw error(401, 'Authentication required');
	}

	if (locals.user.role !== 'staff' && locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user.id} with role ${locals.user.role} attempted to access staff route`);
		throw error(403, 'Staff access required');
	}
}

/**
 * Check if the current user has admin role
 * @param locals - The SvelteKit locals object containing the user
 * @throws 403 error if user is not authenticated or not an admin
 */
export function requireAdmin(locals: Locals) {
	if (!locals.user) {
		logger.warn('Unauthorized access attempt to admin route');
		throw error(401, 'Authentication required');
	}

	if (locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user.id} with role ${locals.user.role} attempted to access admin route`);
		throw error(403, 'Admin access required');
	}
}

/**
 * Check if the current user is authenticated
 * @param locals - The SvelteKit locals object containing the user
 * @throws 401 error if user is not authenticated
 */
export function requireAuth(locals: Locals) {
	if (!locals.user) {
		logger.warn('Unauthorized access attempt to protected route');
		throw error(401, 'Authentication required');
	}
}

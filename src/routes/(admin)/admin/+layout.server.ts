import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    // SECURITY: Admin routes only accessible from admin subdomain
    if (!locals.isAdminDomain) {
        throw error(404, 'Not Found');
    }

    // Block unauthenticated users
    if (!locals.user) {
        throw redirect(302, '/login');
    }

    // Block non-admin users
    if (locals.user.role !== 'admin') {
        throw redirect(302, '/');
    }

    // Pass user to admin pages
    return {
        user: locals.user
    };
};

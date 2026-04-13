import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireStaff } from '$lib/server/auth-guards';
import { generateSecurePassword } from '$lib/server/utils/password';

// GET /api/admin/team/staff/generate-password - Generate a secure random password
export const GET: RequestHandler = async ({ locals }) => {
    requireStaff(locals);

    try {
        const password = generateSecurePassword(20);
        return json({ password });
    } catch (error) {
        console.error('Failed to generate password:', error);
        return json({ error: 'Failed to generate password' }, { status: 500 });
    }
};

import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
    const sessionId = cookies.get('session');

    // Delete session from database
    if (sessionId) {
        await deleteSession(sessionId);
    }

    // Clear session cookie
    cookies.delete('session', { path: '/' });

    // Redirect to login
    throw redirect(302, '/login');
};

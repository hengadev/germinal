import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/session';
import { getCookieDomain, getAdminUrl } from '$lib/server/hostname';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, url }) => {
	const sessionId = cookies.get('session');

	// Delete session from database
	if (sessionId) {
		await deleteSession(sessionId);
	}

	// Clear session cookie with correct domain
	const cookieDomain = getCookieDomain(url.hostname);
	cookies.delete('session', {
		path: '/',
		domain: cookieDomain
	});

	// Redirect to admin login for the current domain environment
	const adminUrl = getAdminUrl(url.hostname);
	throw redirect(302, `${adminUrl}/login`);
};

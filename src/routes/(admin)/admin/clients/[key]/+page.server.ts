import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { getGuest } from '$lib/server/services/guest-summary';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);
	const guest = await getGuest(params.key);
	if (!guest) error(404, 'Client introuvable');
	return { guest };
};

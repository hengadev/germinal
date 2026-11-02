import type { Actions, PageServerLoad } from './$types';
import { unsubscribeByToken } from '$lib/server/services/subscribers';

/**
 * Newsletter unsubscribe (issue 052): one click, no login. The token is
 * unguessable, so the page itself never reveals whether an address is on
 * the list — an unknown token gets the same neutral message as a
 * successful one.
 */
export const load: PageServerLoad = async ({ url }) => {
	return { token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const token = (data.get('token') as string | null)?.trim() ?? '';
		// False for an unknown token (and for one already used): the page
		// shows the neutral message either way.
		const unsubscribed = token !== '' && (await unsubscribeByToken(token));
		return { unsubscribed };
	},
};

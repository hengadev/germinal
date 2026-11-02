import type { Actions, PageServerLoad } from './$types';
import { confirmByToken } from '$lib/server/services/subscribers';

/**
 * Newsletter confirmation (issue 053): the link holds the confirmation
 * token, but confirming needs the button — a link scanner that follows
 * the GET must not put the address on the list. The page never reveals
 * whether a token is known: the neutral message covers both cases.
 */
export const load: PageServerLoad = async ({ url }) => {
	return { token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const token = (data.get('token') as string | null)?.trim() ?? '';
		// False for an unknown token and for one already used.
		const confirmed = token !== '' && (await confirmByToken(token));
		return { confirmed };
	},
};

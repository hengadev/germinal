import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { listGuests, type GuestSort } from '$lib/server/services/guest-summary';
import { tagSuggestions } from '$lib/server/services/guest-notes';

const SORTS: GuestSort[] = ['last-visit', 'visits', 'amount'];

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const search = url.searchParams.get('search')?.trim() ?? '';
	const sortParam = url.searchParams.get('sort') ?? 'last-visit';
	const sort: GuestSort = SORTS.includes(sortParam as GuestSort)
		? (sortParam as GuestSort)
		: 'last-visit';
	const tag = url.searchParams.get('tag')?.trim() ?? '';
	const pageParam = parseInt(url.searchParams.get('page') ?? '1', 10);
	const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

	const result = await listGuests({ search, sort, page, tag });
	// The Guest erasure (issue 055) redirects here with ?erased=1.
	const erased = url.searchParams.get('erased') === '1';
	return { ...result, search, sort, tag, erased, tagSuggestions: await tagSuggestions() };
};

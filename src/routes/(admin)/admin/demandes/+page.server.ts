import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { listDemandes } from '$lib/server/services/contact';
import { resolveDemandePeriod } from '$lib/utils/demande-period';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const inquiryType = url.searchParams.get('type')?.trim() ?? '';
	const status = url.searchParams.get('status')?.trim() ?? '';
	const search = url.searchParams.get('search')?.trim() ?? '';
	const period = url.searchParams.get('period')?.trim() ?? '';
	const from = url.searchParams.get('from')?.trim() ?? '';
	const to = url.searchParams.get('to')?.trim() ?? '';
	const linked = url.searchParams.get('linked')?.trim() ?? '';
	const sort = url.searchParams.get('sort')?.trim() ?? '';

	const range = resolveDemandePeriod(period, new Date(), from, to);

	const demandes = await listDemandes({
		inquiryType,
		status,
		search,
		receivedFrom: range.from,
		receivedTo: range.to,
		linked,
		sort
	});

	return {
		demandes,
		inquiryType,
		status,
		search,
		period: ['today', '7d', '30d', 'custom'].includes(period) ? period : '',
		from,
		to,
		linked,
		sort
	};
};

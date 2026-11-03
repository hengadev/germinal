import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { listDemandes } from '$lib/server/services/contact';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const inquiryType = url.searchParams.get('type')?.trim() ?? '';
	const status = url.searchParams.get('status')?.trim() ?? '';
	const demandes = await listDemandes({ inquiryType, status });
	return { demandes, inquiryType, status };
};

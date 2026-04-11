import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Redirect to talents tab by default for now
	// This will allow the existing talents functionality to work
	throw redirect(302, '/admin/team/talents');
};

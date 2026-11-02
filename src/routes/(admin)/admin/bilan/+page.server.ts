import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { getPastEventsBilan, type BilanPeriod } from '$lib/server/services/attendance';
import { summarizeEvent, computeAverages } from '$lib/utils/bilan';

const PERIODS: BilanPeriod[] = ['3m', '12m', 'tout'];

/** The Admin Bilan page across Events (issue 058). */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	const param = url.searchParams.get('periode') ?? '3m';
	const periode: BilanPeriod = PERIODS.includes(param as BilanPeriod)
		? (param as BilanPeriod)
		: '3m';

	const pastEvents = await getPastEventsBilan(periode);
	const seatings = pastEvents.flatMap((event) => event.seatings);
	return {
		periode,
		events: pastEvents.map((event) => ({
			id: event.id,
			titleFr: event.titleFr,
			lastSeatingEnd: event.lastSeatingEnd,
			summary: summarizeEvent(event.seatings),
			money: event.money
		})),
		averages: computeAverages(seatings)
	};
};

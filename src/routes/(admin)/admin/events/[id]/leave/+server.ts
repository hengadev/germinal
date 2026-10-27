import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { env } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { MOCK_EVENTS, MOCK_SESSIONS } from '$lib/mock-data';
import { deleteEmptyDraft, isEmptyDraftEvent } from '$lib/server/services/event-draft';

/**
 * Leaving the editor of an empty Draft deletes it (issue 015, ADR 0010).
 * The editor posts here best effort on leave — a beacon, for an in-app
 * move as for closing the page. Only an Admin may call it, and the
 * emptiness check is the server's alone (the sweep job's, shared): a
 * Draft with anything saved in it, and any non-Draft Event, is never
 * deleted.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	requireAdmin(locals);
	const { id } = params;

	if (env.USE_MOCK_DATA) {
		const index = MOCK_EVENTS.findIndex((e) => e.id === id);
		const event = MOCK_EVENTS[index];
		if (!event) return json({ deleted: false });
		// Mock mode has no Days, Services, Menus or prices: its Sessions
		// stand in for the schedule, as in the editor.
		const seatings = MOCK_SESSIONS.filter((s) => s.eventId === id).length;
		const deleted = isEmptyDraftEvent(event, {
			days: seatings > 0 ? 1 : 0,
			services: 0,
			seatings,
			menus: 0,
			pricedServices: 0,
			media: (event.media ?? []).length,
		});
		if (deleted) MOCK_EVENTS.splice(index, 1);
		return json({ deleted });
	}

	try {
		return json({ deleted: await deleteEmptyDraft(id) });
	} catch (err) {
		// Best effort: a lost beacon only leaves the sweep job's work.
		logger.error({ err, eventId: id }, 'Error deleting an empty Draft on leave');
		return json({ deleted: false }, { status: 500 });
	}
};

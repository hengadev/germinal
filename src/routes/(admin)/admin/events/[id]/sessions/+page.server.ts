import { getAllSessionsByEventId, createEventSession, updateEventSession, deleteEventSession } from '$lib/server/services/event-sessions';
import { logger } from '$lib/server/logger';
import { getEventById } from '$lib/server/services/events';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const event = await getEventById(params.id);
	const sessions = await getAllSessionsByEventId(params.id);

	return {
		event,
		sessions: sessions.map((s: typeof sessions[number]) => ({
			id: s.id,
			title: s.title,
			description: s.description,
			startTime: s.startTime.toISOString(),
			endTime: s.endTime.toISOString(),
			totalCapacity: s.totalCapacity,
			availableCapacity: s.availableCapacity,
			priceAmount: s.priceAmount,
			currency: s.currency,
			published: s.published,
			allowWaitlist: s.allowWaitlist,
			reservationCount: s.reservationCount
		}))
	};
};

export const actions: Actions = {
	createSession: async ({ request, params }) => {
		if (!params.id) {
			return fail(400, { error: 'Event ID is required' });
		}
		const formData = await request.formData();

		try {
			const session = await createEventSession({
				eventId: params.id,
				title: formData.get('title') as string,
				description: formData.get('description') as string || null,
				startTime: new Date(formData.get('startTime') as string),
				endTime: new Date(formData.get('endTime') as string),
				totalCapacity: parseInt(formData.get('totalCapacity') as string),
				priceAmount: parseInt(formData.get('priceAmount') as string),
				currency: formData.get('currency') as string || 'EUR',
				published: formData.get('published') === 'on',
				allowWaitlist: formData.get('allowWaitlist') === 'on'
			});

			return { success: `Session "${session.title}" created successfully` };
		} catch (err) {
			logger.error({ err }, 'Create session error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to create session' });
		}
	},

	updateSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			await updateEventSession(id, {
				title: formData.get('title') as string,
				description: formData.get('description') as string || null,
				startTime: new Date(formData.get('startTime') as string),
				endTime: new Date(formData.get('endTime') as string),
				totalCapacity: parseInt(formData.get('totalCapacity') as string),
				priceAmount: parseInt(formData.get('priceAmount') as string),
				currency: formData.get('currency') as string,
				published: formData.get('published') === 'on',
				allowWaitlist: formData.get('allowWaitlist') === 'on'
			});

			return { success: 'Session updated successfully' };
		} catch (err) {
			logger.error({ err }, 'Update session error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update session' });
		}
	},

	deleteSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			await deleteEventSession(id);
			return { success: 'Session deleted successfully' };
		} catch (err) {
			logger.error({ err }, 'Delete session error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete session' });
		}
	}
};

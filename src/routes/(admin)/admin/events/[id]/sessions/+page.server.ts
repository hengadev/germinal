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
			titleEn: s.titleEn,
			titleFr: s.titleFr,
			descriptionEn: s.descriptionEn,
			descriptionFr: s.descriptionFr,
			startTime: s.startTime.toISOString(),
			endTime: s.endTime.toISOString(),
			totalCapacity: s.totalCapacity,
			availableCapacity: s.availableCapacity,
			priceAmount: s.priceAmount,
			currency: s.currency,
			published: s.published,
			allowWaitlist: s.allowWaitlist,
			badgeType: s.badgeType,
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
		const titleEn = formData.get('titleEn') as string;
		const titleFr = formData.get('titleFr') as string;
		const descriptionEn = formData.get('descriptionEn') as string || null;
		const descriptionFr = formData.get('descriptionFr') as string || null;

		try {
			const session = await createEventSession({
				eventId: params.id,
				titleEn,
				titleFr,
				descriptionEn,
				descriptionFr,
				startTime: new Date(formData.get('startTime') as string),
				endTime: new Date(formData.get('endTime') as string),
				totalCapacity: parseInt(formData.get('totalCapacity') as string),
				priceAmount: parseInt(formData.get('priceAmount') as string),
				currency: formData.get('currency') as string || 'EUR',
				published: formData.get('published') === 'on',
				allowWaitlist: formData.get('allowWaitlist') === 'on',
				badgeType: (formData.get('badgeType') as string || 'none') as 'none' | 'featured' | 'vip' | 'popular' | 'best_value' | 'limited'
			});

			return { success: `Séance "${session.titleEn}" créée avec succès` };
		} catch (err) {
			logger.error({ err }, 'Create session error');
			const message = err instanceof Error && (err.message === 'Event not found' || err.message === 'Session times must fall within the event dates')
				? err.message
				: 'Failed to create session';
			return fail(500, { error: message });
		}
	},

	updateSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;
		const titleEn = formData.get('titleEn') as string;
		const titleFr = formData.get('titleFr') as string;
		const descriptionEn = formData.get('descriptionEn') as string || null;
		const descriptionFr = formData.get('descriptionFr') as string || null;

		try {
			await updateEventSession(id, {
				titleEn,
				titleFr,
				descriptionEn,
				descriptionFr,
				startTime: new Date(formData.get('startTime') as string),
				endTime: new Date(formData.get('endTime') as string),
				totalCapacity: parseInt(formData.get('totalCapacity') as string),
				priceAmount: parseInt(formData.get('priceAmount') as string),
				currency: formData.get('currency') as string,
				published: formData.get('published') === 'on',
				allowWaitlist: formData.get('allowWaitlist') === 'on',
				badgeType: (formData.get('badgeType') as string || 'none') as 'none' | 'featured' | 'vip' | 'popular' | 'best_value' | 'limited'
			});

			return { success: 'Séance mise à jour avec succès' };
		} catch (err) {
			logger.error({ err }, 'Update session error');
			const message = err instanceof Error && err.message === 'Session times must fall within the event dates'
				? err.message
				: 'Failed to update session';
			return fail(500, { error: message });
		}
	},

	deleteSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			await deleteEventSession(id);
			return { success: 'Séance supprimée avec succès' };
		} catch (err) {
			logger.error({ err }, 'Delete session error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete session' });
		}
	}
};

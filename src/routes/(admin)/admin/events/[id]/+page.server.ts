import { fail, redirect, error, type Actions, type ServerLoad } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS, MOCK_TALENTS } from '$lib/mock-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	if (env.USE_MOCK_DATA) {
		// Mock mode - find event in mock data
		const event = MOCK_EVENTS.find((e: typeof MOCK_EVENTS[number]) => e.id === id);

		if (!event) {
			throw error(404, 'Event not found');
		}

		// Mock sessions - return sessions for this event with consistent structure
		const sessions = MOCK_SESSIONS
			.filter(s => s.eventId === id)
			.map(s => ({
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
				badgeType: (s as any).badgeType || 'none',
				reservationCount: MOCK_RESERVATIONS.filter(r => r.eventSessionId === s.id).length
			}));

		// Mock reservations - filter by session IDs that belong to this event
		const sessionIds = sessions.map(s => s.id);
		const reservations = MOCK_RESERVATIONS
			.filter(r => sessionIds.includes(r.eventSessionId))
			.map(r => {
				const session = MOCK_SESSIONS.find(s => s.id === r.eventSessionId);
				const evt = MOCK_EVENTS.find(e => e.id === session?.eventId);
				return {
					id: r.id,
					guestName: r.guestName,
					guestEmail: r.guestEmail,
					quantity: r.quantity,
					totalAmount: r.totalAmount,
					currency: r.currency,
					status: r.status,
					createdAt: r.createdAt,
					confirmedAt: r.confirmedAt,
					eventTitle: evt?.titleEn || '',
					sessionTitle: session?.title || '',
					sessionStartTime: session?.startTime?.toISOString() || '',
					paymentStatus: r.paymentStatus
				};
			});

		const talents = MOCK_TALENTS.map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }));
		return { event, sessions, reservations, promoCodes: [], talents };
	}

	// Database mode - fetch from database
	const { getEventById } = await import('$lib/server/services/events');
	const { getAllSessionsByEventId } = await import('$lib/server/services/event-sessions');
	const { getPromoCodesForEvent } = await import('$lib/server/services/promo-codes');
	const { db } = await import('$lib/server/db');
	const { reservations } = await import('$lib/server/db/schema');
	const { desc, eq, inArray } = await import('drizzle-orm');

	try {
		const event = await getEventById(id);
		const sessionsData = await getAllSessionsByEventId(id);
		const promoCodes = await getPromoCodesForEvent(id);

		// Get session IDs for reservation filtering
		const sessionIds = sessionsData.map((s: typeof sessionsData[number]) => s.id);

		// Get all reservations for this event (through sessions)
		const reservationsData = sessionIds.length > 0
			? await db.query.reservations.findMany({
				where: inArray(reservations.eventSessionId, sessionIds),
				orderBy: [desc(reservations.createdAt)],
				with: {
					eventSession: {
						columns: {
							id: true,
							title: true,
							startTime: true
						}
					},
					payment: {
						columns: {
							status: true,
							amount: true,
							currency: true
						}
					}
				}
			})
			: [];

		// Load talents for collaborator selector
		const { getAllTalents } = await import('$lib/server/services/talents');
		const talentsData = await getAllTalents({ publishedOnly: false, limit: 1000 });
		const talents = talentsData.data.map((t: typeof talentsData.data[number]) => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }));

		return {
			event,
			promoCodes,
			talents,
			sessions: sessionsData.map((s: typeof sessionsData[number]) => ({
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
				badgeType: s.badgeType,
				reservationCount: s.reservationCount
			})),
			reservations: reservationsData.map((r: typeof reservationsData[number]) => ({
				id: r.id,
				guestName: r.guestName,
				guestEmail: r.guestEmail,
				quantity: r.quantity,
				totalAmount: r.totalAmount,
				currency: r.currency,
				status: r.status,
				createdAt: r.createdAt.toISOString(),
				confirmedAt: r.confirmedAt?.toISOString(),
				eventTitle: event.titleEn,
				sessionTitle: r.eventSession.title,
				sessionStartTime: r.eventSession.startTime.toISOString(),
				paymentStatus: r.payment?.status || 'none'
			}))
		};
	} catch (err) {
		if (err instanceof Error && err.message === 'Event not found') {
			throw error(404, 'Event not found');
		}
		throw err;
	}
};

export const actions: Actions = {
	// Update event action
	updateEvent: async ({ request, params }) => {
		const { id } = params;

		// Validate id
		if (!id) {
			return fail(400, { error: 'Event ID is required' });
		}

		const formData = await request.formData();
		const titleEn = formData.get('titleEn');
		const titleFr = formData.get('titleFr');
		const slug = formData.get('slug');
		const descriptionEn = formData.get('descriptionEn');
		const descriptionFr = formData.get('descriptionFr');
		const subtitleEn = formData.get('subtitleEn');
		const subtitleFr = formData.get('subtitleFr');
		const startDate = formData.get('startDate');
		const endDate = formData.get('endDate');
		const locationEn = formData.get('locationEn');
		const locationFr = formData.get('locationFr');
		const venueNameEn = formData.get('venueNameEn');
		const venueNameFr = formData.get('venueNameFr');
		const streetAddressEn = formData.get('streetAddressEn');
		const streetAddressFr = formData.get('streetAddressFr');
		const districtEn = formData.get('districtEn');
		const districtFr = formData.get('districtFr');
		const cityEn = formData.get('cityEn');
		const cityFr = formData.get('cityFr');
		const postalCode = formData.get('postalCode');
		const countryEn = formData.get('countryEn');
		const countryFr = formData.get('countryFr');
		const collaborators = formData.get('collaborators');
		const timings = formData.get('timings');
		const curatorEn = formData.get('curatorEn');
		const curatorFr = formData.get('curatorFr');
		const materialsEn = formData.get('materialsEn');
		const materialsFr = formData.get('materialsFr');
		const admissionInfoEn = formData.get('admissionInfoEn');
		const admissionInfoFr = formData.get('admissionInfoFr');
		const published = formData.get('published') === 'true';
		const isSpotlight = formData.get('isSpotlight') === 'true';

		// Validation
		if (!titleEn || typeof titleEn !== 'string') {
			return fail(400, { error: 'Title (English) is required' });
		}

		if (!titleFr || typeof titleFr !== 'string') {
			return fail(400, { error: 'Title (French) is required' });
		}

		if (!slug || typeof slug !== 'string') {
			return fail(400, { error: 'Slug is required' });
		}

		if (!descriptionEn || typeof descriptionEn !== 'string') {
			return fail(400, { error: 'Description (English) is required' });
		}

		if (!descriptionFr || typeof descriptionFr !== 'string') {
			return fail(400, { error: 'Description (French) is required' });
		}

		if (!startDate || typeof startDate !== 'string') {
			return fail(400, { error: 'Start date is required' });
		}

		if (!endDate || typeof endDate !== 'string') {
			return fail(400, { error: 'End date is required' });
		}

		if (!locationEn || typeof locationEn !== 'string') {
			return fail(400, { error: 'Location (English) is required' });
		}

		if (!locationFr || typeof locationFr !== 'string') {
			return fail(400, { error: 'Location (French) is required' });
		}

		// Validate slug format
		if (!/^[a-z0-9-]+$/.test(slug)) {
			return fail(400, { error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
		}

		// Validate dates
		const start = new Date(startDate);
		const end = new Date(endDate);

		if (isNaN(start.getTime()) || isNaN(end.getTime())) {
			return fail(400, { error: 'Invalid date format' });
		}

		if (end < start) {
			return fail(400, { error: 'End date must be after start date' });
		}

		// Validate: published events must have at least one session
		if (published) {
			if (env.USE_MOCK_DATA) {
				const hasSessions = MOCK_SESSIONS.some(s => s.eventId === id);
				if (!hasSessions) {
					return fail(400, { error: 'Cannot publish event without at least one session. Please add a session first.' });
				}
			} else {
				const { getAllSessionsByEventId } = await import('$lib/server/services/event-sessions');
				const sessions = await getAllSessionsByEventId(id);
				if (!sessions || sessions.length === 0) {
					return fail(400, { error: 'Cannot publish event without at least one session. Please add a session first.' });
				}
			}
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - update in mock data array (not persisted)
			const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);

			if (eventIndex === -1) {
				return fail(404, { error: 'Event not found' });
			}

			// If isSpotlight is true, unset others in mock array
			if (isSpotlight) {
				MOCK_EVENTS.forEach(e => e.isSpotlight = false);
			}

			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				titleEn,
				titleFr,
				slug,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
				startDate: start,
				endDate: end,
				locationEn,
				locationFr,
				venueNameEn: venueNameEn?.toString() || null,
				venueNameFr: venueNameFr?.toString() || null,
				streetAddressEn: streetAddressEn?.toString() || null,
				streetAddressFr: streetAddressFr?.toString() || null,
				districtEn: districtEn?.toString() || null,
				districtFr: districtFr?.toString() || null,
				cityEn: cityEn?.toString() || null,
				cityFr: cityFr?.toString() || null,
				postalCode: postalCode?.toString() || null,
				countryEn: countryEn?.toString() || null,
				countryFr: countryFr?.toString() || null,
				collaborators: collaborators?.toString() || null,
				timings: timings?.toString() || null,
				curatorEn: curatorEn?.toString() || null,
				curatorFr: curatorFr?.toString() || null,
				materialsEn: materialsEn?.toString() || null,
				materialsFr: materialsFr?.toString() || null,
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				published,
				isSpotlight,
				updatedAt: new Date()
			} as typeof MOCK_EVENTS[number];

			return { success: `Event "${titleEn}" updated successfully (mock mode - not persisted)` };
		}

		// Database mode - use actual database functions
		const { updateEvent } = await import('$lib/server/services/events');

		try {
			await updateEvent(id, {
				titleEn,
				titleFr,
				slug,
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
				startDate: start,
				endDate: end,
				locationEn,
				locationFr,
				venueNameEn: venueNameEn?.toString() || null,
				venueNameFr: venueNameFr?.toString() || null,
				streetAddressEn: streetAddressEn?.toString() || null,
				streetAddressFr: streetAddressFr?.toString() || null,
				districtEn: districtEn?.toString() || null,
				districtFr: districtFr?.toString() || null,
				cityEn: cityEn?.toString() || null,
				cityFr: cityFr?.toString() || null,
				postalCode: postalCode?.toString() || null,
				countryEn: countryEn?.toString() || null,
				countryFr: countryFr?.toString() || null,
				collaborators: collaborators?.toString() || null,
				timings: timings?.toString() || null,
				curatorEn: curatorEn?.toString() || null,
				curatorFr: curatorFr?.toString() || null,
				materialsEn: materialsEn?.toString() || null,
				materialsFr: materialsFr?.toString() || null,
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				published,
				isSpotlight
			});

			return { success: `Événement "${titleEn}" mis à jour` };
		} catch (error) {
			logger.error({ err: error }, 'Error updating event');
			return fail(500, { error: 'Failed to update event. The slug may already be in use.' });
		}
	},

	// Update media action (Photos tab)
	updateMedia: async ({ request, params }) => {
		const { id } = params;
		if (!id) return fail(400, { error: 'Event ID is required' });

		const formData = await request.formData();
		const coverMediaId = formData.get('coverMediaId')?.toString() || null;
		const galleryMediaIdsRaw = formData.get('galleryMediaIds')?.toString() || null;

		let galleryIds: string[] = [];
		try { galleryIds = galleryMediaIdsRaw ? JSON.parse(galleryMediaIdsRaw) : []; } catch { /* ignore */ }

		if (env.USE_MOCK_DATA) {
			const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);
			if (eventIndex === -1) return fail(404, { error: 'Event not found' });
			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				coverMediaId: coverMediaId || null,
				updatedAt: new Date()
			} as typeof MOCK_EVENTS[number];
			return { success: 'Photos mises à jour' };
		}

		try {
			const { updateEvent } = await import('$lib/server/services/events');
			const { db } = await import('$lib/server/db');
			const { media } = await import('$lib/server/db/schema');
			const { eq } = await import('drizzle-orm');

			// Update coverMediaId on the event
			await updateEvent(id, { coverMediaId: coverMediaId || null });

			// Build ordered list: cover first, then gallery
			const allMediaIds = coverMediaId
				? [coverMediaId, ...galleryIds.filter((mid) => mid !== coverMediaId)]
				: galleryIds;

			// Reset all cover flags for this event
			await db.update(media).set({ isCover: false }).where(eq(media.eventId, id));

			// Link all media to event and mark cover
			for (let i = 0; i < allMediaIds.length; i++) {
				await db.update(media)
					.set({ eventId: id, isCover: i === 0 })
					.where(eq(media.id, allMediaIds[i]));
			}

			return { success: 'Photos mises à jour' };
		} catch (error) {
			logger.error({ err: error }, 'Error updating media');
			return fail(500, { error: 'Échec de la mise à jour des photos' });
		}
	},

	// Delete a single photo immediately
	deletePhoto: async ({ request, params }) => {
		const { id } = params;
		if (!id) return fail(400, { error: 'Event ID is required' });

		const formData = await request.formData();
		const mediaId = formData.get('mediaId')?.toString();
		if (!mediaId) return fail(400, { error: 'Media ID is required' });

		if (env.USE_MOCK_DATA) {
			return { success: 'Photo supprimée' };
		}

		try {
			const { db } = await import('$lib/server/db');
			const { media } = await import('$lib/server/db/schema');
			const { eq, and } = await import('drizzle-orm');
			const { deleteMedia } = await import('$lib/server/services/media');

			// Security: verify media belongs to this event
			const [item] = await db.select().from(media)
				.where(and(eq(media.id, mediaId), eq(media.eventId, id)));
			if (!item) return fail(404, { error: 'Photo non trouvée' });

			await deleteMedia(mediaId);
			return { success: 'Photo supprimée' };
		} catch (error) {
			logger.error({ err: error, mediaId }, 'Error deleting photo');
			return fail(500, { error: 'Échec de la suppression de la photo' });
		}
	},

	// Create session action
	createSession: async ({ request, params }) => {
		if (!params.id) {
			return fail(400, { error: 'Event ID is required' });
		}
		const formData = await request.formData();

		try {
			const { createEventSession } = await import('$lib/server/services/event-sessions');

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

			return { success: `Séance "${session.title}" créée avec succès` };
		} catch (err) {
			logger.error({ err }, 'Create session error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to create session' });
		}
	},

	// Update session action
	updateSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			const { updateEventSession } = await import('$lib/server/services/event-sessions');

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

			return { success: 'Séance mise à jour avec succès' };
		} catch (err) {
			logger.error({ err }, 'Update session error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update session' });
		}
	},

	// Delete session action
	deleteSession: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			const { deleteEventSession } = await import('$lib/server/services/event-sessions');

			await deleteEventSession(id);
			return { success: 'Séance supprimée avec succès' };
		} catch (err) {
			logger.error({ err }, 'Delete session error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete session' });
		}
	},

	// Create promotion code action
	createPromoCode: async ({ request, params }) => {
		const { id: eventId } = params;
		if (!eventId) return fail(400, { error: 'Event ID is required' });

		if (env.USE_MOCK_DATA) {
			return { success: 'Code promo créé (mode démo — non persisté)' };
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const code = formData.get('code')?.toString().trim();
		const discountType = formData.get('discountType')?.toString();
		const discountValueRaw = formData.get('discountValue')?.toString();
		const currency = formData.get('currency')?.toString().trim() || 'EUR';
		const maxRedemptionsRaw = formData.get('maxRedemptions')?.toString().trim();
		const expiresAtRaw = formData.get('expiresAt')?.toString().trim();

		if (!name) return fail(400, { error: 'Name is required' });
		if (!code) return fail(400, { error: 'Code is required' });
		if (!/^[A-Z0-9_-]+$/i.test(code)) return fail(400, { error: 'Code must contain only letters, numbers, hyphens, or underscores' });
		if (discountType !== 'percent' && discountType !== 'amount') return fail(400, { error: 'Invalid discount type' });

		const discountValue = parseInt(discountValueRaw ?? '');
		if (isNaN(discountValue) || discountValue <= 0) return fail(400, { error: 'Discount value must be a positive number' });
		if (discountType === 'percent' && discountValue > 100) return fail(400, { error: 'Percent discount cannot exceed 100' });

		const maxRedemptions = maxRedemptionsRaw ? parseInt(maxRedemptionsRaw) : undefined;
		if (maxRedemptionsRaw && (isNaN(maxRedemptions!) || maxRedemptions! <= 0)) {
			return fail(400, { error: 'Max redemptions must be a positive number' });
		}

		const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : undefined;
		if (expiresAtRaw && isNaN(expiresAt!.getTime())) return fail(400, { error: 'Invalid expiry date' });

		try {
			const { createPromoCode } = await import('$lib/server/services/promo-codes');
			await createPromoCode({
				eventId,
				name,
				code: code.toUpperCase(),
				discountType: discountType as 'percent' | 'amount',
				discountValue: discountType === 'amount' ? Math.round(discountValue * 100) : discountValue,
				currency: discountType === 'amount' ? currency : undefined,
				maxRedemptions,
				expiresAt,
			});
			return { success: `Code promo "${code.toUpperCase()}" créé avec succès` };
		} catch (err) {
			logger.error({ err }, 'Create promo code error');
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to create promotion code' });
		}
	},

	// Deactivate promotion code action
	deactivatePromoCode: async ({ request }) => {
		if (env.USE_MOCK_DATA) {
			return { success: 'Code promo désactivé (mode démo — non persisté)' };
		}

		const formData = await request.formData();
		const promoCodeId = formData.get('promoCodeId')?.toString();
		if (!promoCodeId) return fail(400, { error: 'Promotion code ID is required' });

		try {
			const { deactivatePromoCode } = await import('$lib/server/services/promo-codes');
			await deactivatePromoCode(promoCodeId);
			return { success: 'Code promo désactivé' };
		} catch (err) {
			logger.error({ err }, 'Deactivate promo code error');
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to deactivate promotion code' });
		}
	}
};

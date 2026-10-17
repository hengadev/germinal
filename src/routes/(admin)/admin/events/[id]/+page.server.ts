import { fail, redirect, error, type Actions, type ServerLoad } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS, MOCK_TALENTS } from '$lib/mock-data';
import {
	assertEventHasSeatings,
	DEFAULT_SERVICE_DURATION_MINUTES,
	EventWithoutSeatingError,
	formatSeatingOverlapWarning,
	loadSeatingsEditor,
	LUNCH_DINNER_CUTOFF_HOUR,
	parsePickedDays,
	parseSeatingsPayload,
	parseVenueCapacity,
	pickedDaysErrorMessage,
	saveEventSchedule,
	saveServiceSeatings,
	ScheduleSaveRefusedError,
	seatingsPayloadErrorMessage,
	seatingTitle,
	VENUE_CAPACITY_ERROR_MESSAGE,
	type PickedServiceDay,
} from '$lib/server/services/event-schedule';
import { parseServiceRefs, resolveServiceRefs, serviceKey } from '$lib/server/services/new-event-schedule';
import type { EditorService } from '$lib/types/seatings-editor';
import type { PricingEditorData } from '$lib/types/pricing-editor';
import { depositRuleOf } from '$lib/utils/pricing';
import { refundPolicyOf } from '$lib/utils/refund-policy';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { canBeSpotlight, parseVisibility } from '$lib/utils/event-access';

const SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE = 'Seul un événement Public peut être mis en avant (Spotlight).';

/**
 * The Event's Days with their lunch/dinner Services, ordered by date then
 * meal — the shape the admin Days picker is seeded with.
 */
async function loadScheduleDays(eventId: string): Promise<PickedServiceDay[]> {
	const { db } = await import('$lib/server/db');
	const { eventDays, eventServices } = await import('$lib/server/db/schema');
	const { eq } = await import('drizzle-orm');

	const rows = await db
		.select({ date: eventDays.date, kind: eventServices.kind })
		.from(eventDays)
		.innerJoin(eventServices, eq(eventServices.dayId, eventDays.id))
		.where(eq(eventDays.eventId, eventId))
		.orderBy(eventDays.date, eventServices.kind);

	const days: PickedServiceDay[] = [];
	for (const row of rows) {
		const date = typeof row.date === 'string' ? row.date : String(row.date).slice(0, 10);
		const current = days.find((day) => day.date === date);
		if (current) {
			current.kinds.push(row.kind);
		} else {
			days.push({ date, kinds: [row.kind] });
		}
	}
	return days;
}

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
				titleEn: (s as any).titleEn || s.title,
				titleFr: (s as any).titleFr || s.title,
				descriptionEn: (s as any).descriptionEn ?? null,
				descriptionFr: (s as any).descriptionFr ?? null,
				startTime: s.startTime.toISOString(),
				endTime: s.endTime.toISOString(),
				totalCapacity: s.totalCapacity,
				availableCapacity: s.availableCapacity,
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
					depositAmount: (r as { depositAmount?: number }).depositAmount ?? null,
					balanceAmount: (r as { balanceAmount?: number }).balanceAmount ?? null,
					currency: r.currency,
					status: r.status,
					createdAt: r.createdAt,
					confirmedAt: r.confirmedAt,
					eventTitle: evt?.titleEn || '',
					seatingId: r.eventSessionId,
					sessionTitle: session ? seatingTitle(session, 'en') : '',
					sessionStartTime: session?.startTime?.toISOString() || '',
					paymentStatus: r.paymentStatus,
					isComp: (r as { isComp?: boolean }).isComp ?? false
				};
			});

		const talents = MOCK_TALENTS.map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }));

		// Mock mode has no Days table: derive them from the mock Seatings,
		// lunch before the UTC cut-off and dinner after (same rule as the DB).
		const daysMap = new Map<string, PickedServiceDay>();
		for (const session of MOCK_SESSIONS.filter(s => s.eventId === id)) {
			const date = session.startTime.toISOString().slice(0, 10);
			const kind = session.startTime.getUTCHours() < LUNCH_DINNER_CUTOFF_HOUR ? 'lunch' : 'dinner';
			const day = daysMap.get(date) ?? { date, kinds: [] as ('lunch' | 'dinner')[] };
			if (!day.kinds.includes(kind)) day.kinds.push(kind);
			daysMap.set(date, day);
		}
		const days = [...daysMap.values()].sort((a, b) => a.date.localeCompare(b.date));

		// Mock Venue Capacity: the largest mock Seating capacity, as the
		// 0020 migration backfills it; the others count as overrides.
		const venueCapacity = sessions.length > 0
			? Math.max(...sessions.map((session) => session.totalCapacity))
			: null;

		// Mock Seatings editor: one synthetic Service per Day and meal.
		const clock = (instant: Date) => instant.toISOString().slice(11, 16);
		const schedule: EditorService[] = days.flatMap((day, dayIndex) => (['lunch', 'dinner'] as const).filter((kind) => day.kinds.includes(kind)).map((kind, kindIndex) => ({
			serviceId: `00000000-0000-4000-8000-${String(dayIndex * 2 + kindIndex).padStart(12, '0')}`,
			date: day.date,
			kind,
			defaultDurationMinutes: DEFAULT_SERVICE_DURATION_MINUTES[kind],
			seatings: sessions
				.filter((session) =>
					session.startTime.slice(0, 10) === day.date &&
					(new Date(session.startTime).getUTCHours() < LUNCH_DINNER_CUTOFF_HOUR ? 'lunch' : 'dinner') === kind)
				.map((session) => ({
					id: session.id,
					start: clock(new Date(session.startTime)),
					end: clock(new Date(session.endTime)),
					titleEn: session.titleEn ?? null,
					titleFr: session.titleFr ?? null,
					descriptionEn: session.descriptionEn,
					descriptionFr: session.descriptionFr,
					totalCapacity: session.totalCapacity,
					availableCapacity: session.availableCapacity,
					capacityOverridden: session.totalCapacity !== venueCapacity,
					published: session.published,
					allowWaitlist: session.allowWaitlist,
					badgeType: session.badgeType,
					reservationCount: session.reservationCount,
				})),
		})));

		// Mock « Menus & tarifs »: no Menu yet; each synthetic Service is
		// priced like its first mock Seating.
		const pricing: PricingEditorData = {
			menus: [],
			services: schedule.map((service) => {
				const first = MOCK_SESSIONS.find((session) => session.id === service.seatings[0]?.id);
				return {
					serviceId: service.serviceId,
					date: service.date,
					kind: service.kind,
					menuId: null,
					priceAmount: first?.priceAmount ?? null,
					currency: first?.currency ?? 'EUR',
					seatingCount: service.seatings.length,
					legacySeatings: [],
				};
			}),
			deposit: depositRuleOf(event),
			refundPolicy: refundPolicyOf(event),
		};

		return { event, sessions, reservations, promoCodes: [], talents, days, schedule, venueCapacity, pricing };
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
							titleEn: true,
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

		const days = await loadScheduleDays(id);
		const schedule = await loadSeatingsEditor(id);
		const { loadPricingEditor } = await import('$lib/server/services/service-pricing');
		const pricing = await loadPricingEditor(id);

		return {
			event,
			promoCodes,
			talents,
			days,
			schedule,
			pricing,
			venueCapacity: event.venueCapacity,
			sessions: sessionsData.map((s: typeof sessionsData[number]) => ({
				id: s.id,
				titleEn: s.titleEn,
				titleFr: s.titleFr,
				descriptionEn: s.descriptionEn,
				descriptionFr: s.descriptionFr,
				startTime: s.startTime.toISOString(),
				endTime: s.endTime.toISOString(),
				totalCapacity: s.totalCapacity,
				availableCapacity: s.availableCapacity,
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
				depositAmount: r.depositAmount,
				balanceAmount: r.balanceAmount,
				currency: r.currency,
				status: r.status,
				createdAt: r.createdAt.toISOString(),
				confirmedAt: r.confirmedAt?.toISOString(),
				eventTitle: event.titleEn,
				seatingId: r.eventSessionId,
				sessionTitle: seatingTitle(r.eventSession, 'en'),
				sessionStartTime: r.eventSession.startTime.toISOString(),
				paymentStatus: r.payment?.status || 'none',
				isComp: r.isComp
			})),
			eventStaff: [],
			tasks: [],
			allStaff: [],
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
	updateEvent: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;

		// Validate id
		if (!id) {
			return fail(400, { error: 'Event ID is required' });
		}

		const formData = await request.formData();
		const titleEn = formData.get('titleEn');
		const titleFr = formData.get('titleFr');
		const descriptionEn = formData.get('descriptionEn');
		const descriptionFr = formData.get('descriptionFr');
		const subtitleEn = formData.get('subtitleEn');
		const subtitleFr = formData.get('subtitleFr');
		// The Days, and the start/end dates derived from them, are saved
		// with the Seatings (« Dates & séances » tab, `saveSeatings`).
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
		const admissionInfoEn = formData.get('admissionInfoEn');
		const admissionInfoFr = formData.get('admissionInfoFr');
		const visibility = parseVisibility(formData.get('visibility'));
		const isSpotlight = formData.get('isSpotlight') === 'true';
		const isPortfolio = formData.get('isPortfolio') === 'true';

		if (!visibility) {
			return fail(400, { error: 'Visibilité invalide' });
		}

		// Only a Public Event can be the Spotlight (issue 032).
		if (isSpotlight && !canBeSpotlight({ visibility })) {
			return fail(400, { error: SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE });
		}

		// Validation
		if (!titleEn || typeof titleEn !== 'string') {
			return fail(400, { error: 'Title (English) is required' });
		}

		if (!titleFr || typeof titleFr !== 'string') {
			return fail(400, { error: 'Title (French) is required' });
		}

		if (!descriptionEn || typeof descriptionEn !== 'string') {
			return fail(400, { error: 'Description (English) is required' });
		}

		if (!descriptionFr || typeof descriptionFr !== 'string') {
			return fail(400, { error: 'Description (French) is required' });
		}

		if (!locationEn || typeof locationEn !== 'string') {
			return fail(400, { error: 'Location (English) is required' });
		}

		if (!locationFr || typeof locationFr !== 'string') {
			return fail(400, { error: 'Location (French) is required' });
		}

		// A published Event must have at least one Seating (ADR 0001).
		if (visibility !== 'draft') {
			if (env.USE_MOCK_DATA) {
				if (!MOCK_SESSIONS.some(s => s.eventId === id)) {
					return fail(400, { error: new EventWithoutSeatingError().message });
				}
			} else {
				try {
					await assertEventHasSeatings(id);
				} catch (seatingError) {
					if (seatingError instanceof EventWithoutSeatingError) {
						return fail(400, { error: seatingError.message });
					}
					throw seatingError;
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
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
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
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				visibility,
				isSpotlight,
				isPortfolio,
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
				descriptionEn,
				descriptionFr,
				subtitleEn: subtitleEn?.toString() || null,
				subtitleFr: subtitleFr?.toString() || null,
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
				admissionInfoEn: admissionInfoEn?.toString() || null,
				admissionInfoFr: admissionInfoFr?.toString() || null,
				visibility,
				isSpotlight,
				isPortfolio
			});

			return { success: `Événement « ${titleEn} » mis à jour` };
		} catch (error) {
			const { SpotlightRequiresPublicError } = await import('$lib/server/services/events');
			if (error instanceof SpotlightRequiresPublicError) {
				return fail(400, { error: SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE });
			}
			logger.error({ err: error }, 'Error updating event');
			return fail(500, { error: 'Failed to update event.' });
		}
	},

	// Update media action (Photos tab)
	updateMedia: async ({ request, params, locals }) => {
		requireAdmin(locals);
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
	deletePhoto: async ({ request, params, locals }) => {
		requireAdmin(locals);
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

	// Save the « Dates & séances » tab: the picked Days and meals (issue
	// 019), then each Service's default Seating duration and its Seatings,
	// entered as start times (issue 020) — with the Event's Venue Capacity,
	// which inheriting Seatings follow (issue 021). A meal picked in the tab
	// but not saved yet is named by a placeholder, mapped to its Day and
	// meal by `serviceRefs` as on the new-event form.
	saveSeatings: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;
		if (!id) {
			return fail(400, { error: 'L’identifiant de l’événement est requis.' });
		}

		const formData = await request.formData();
		const pickedDays = parsePickedDays(
			typeof formData.get('days') === 'string' ? formData.get('days') as string : null
		);
		if (!pickedDays.ok) {
			return fail(400, { error: pickedDaysErrorMessage(pickedDays.reason) });
		}
		const rawRefs = formData.get('serviceRefs');
		const refs = parseServiceRefs(typeof rawRefs === 'string' ? rawRefs : null, pickedDays.days);
		if (!refs) {
			return fail(400, { error: 'Les repas des séances ne correspondent pas aux jours sélectionnés.' });
		}
		const raw = formData.get('services');
		const parsed = parseSeatingsPayload(typeof raw === 'string' ? raw : null);
		if (!parsed.ok) {
			return fail(400, { error: seatingsPayloadErrorMessage(parsed.reason) });
		}
		const rawVenueCapacity = formData.get('venueCapacity');
		const venue = parseVenueCapacity(typeof rawVenueCapacity === 'string' ? rawVenueCapacity : null);
		if (!venue.ok) {
			return fail(400, { error: VENUE_CAPACITY_ERROR_MESSAGE });
		}

		if (env.USE_MOCK_DATA) {
			return { success: 'Séances enregistrées (mode démo — non persistées)' };
		}

		try {
			// The Days first: this refuses to remove a Day or Service that
			// still has Reservations, and recomputes the Event's start/end
			// dates from its first and last Day.
			await saveEventSchedule(id, pickedDays.days);

			// Then the Seatings, with the placeholders swapped for the
			// Services just created; saved Services keep their id.
			const realIds = new Map(
				(await loadSeatingsEditor(id)).map((service) => [serviceKey(service.date, service.kind), service.serviceId])
			);
			const placeholderIds = new Set(refs.map((ref) => ref.ref));
			const services = [
				...parsed.services.filter((service) => !placeholderIds.has(service.serviceId)),
				...resolveServiceRefs(parsed.services.filter((service) => placeholderIds.has(service.serviceId)), refs, realIds),
			];
			const result = await saveServiceSeatings(id, services, venue.venueCapacity);

			if (result.removedSeatingIds.length > 0) {
				const { recordAuditLog } = await import('$lib/server/services/audit-log');
				for (const seatingId of result.removedSeatingIds) {
					await recordAuditLog({
						adminId: locals.user!.id,
						action: 'session.delete',
						entityType: 'session',
						entityId: seatingId,
					});
				}
			}

			// Overlaps were flagged in the editor before saving; they are a
			// warning, not a refusal (PRD), so the save goes through and
			// reports them again.
			const warning = result.overlaps.length > 0
				? ` ${formatSeatingOverlapWarning(result.overlaps)}`
				: '';
			return { success: `Séances enregistrées.${warning}` };
		} catch (err) {
			if (err instanceof ScheduleSaveRefusedError) {
				return fail(400, { error: err.message });
			}
			logger.error({ err }, 'Save seatings error');
			return fail(500, { error: 'Échec de l’enregistrement des séances.' });
		}
	},

	// Save the « Menus & tarifs » tab (issue 022): the Event's Menus and,
	// per Service, its Menu and price.
	savePricing: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;
		if (!id) {
			return fail(400, { error: 'L’identifiant de l’événement est requis.' });
		}

		const { parsePricingPayload, pricingPayloadErrorMessage, savePricing } = await import(
			'$lib/server/services/service-pricing'
		);
		const formData = await request.formData();
		const raw = formData.get('pricing');
		const parsed = parsePricingPayload(typeof raw === 'string' ? raw : null);
		if (!parsed.ok) {
			return fail(400, { error: pricingPayloadErrorMessage(parsed.reason) });
		}

		if (env.USE_MOCK_DATA) {
			return { success: 'Menus et tarifs enregistrés (mode démo — non persistés)' };
		}

		try {
			await savePricing(id, parsed.payload);
			return { success: 'Menus et tarifs enregistrés.' };
		} catch (err) {
			if (err instanceof ScheduleSaveRefusedError) {
				return fail(400, { error: err.message });
			}
			logger.error({ err }, 'Save pricing error');
			return fail(500, { error: 'Échec de l’enregistrement des menus et tarifs.' });
		}
	},

	// Create promotion code action
	createPromoCode: async ({ request, params, locals }) => {
		requireAdmin(locals);
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
	deactivatePromoCode: async ({ request, locals }) => {
		requireAdmin(locals);
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

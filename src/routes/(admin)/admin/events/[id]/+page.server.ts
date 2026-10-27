import { fail, error } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { env } from '$lib/server/env';
import { MOCK_EVENTS, MOCK_SESSIONS, MOCK_RESERVATIONS, MOCK_TALENTS } from '$lib/mock-data';
import {
	DEFAULT_SERVICE_DURATION_MINUTES,
	formatSeatingOverlapWarning,
	changeEventTimeZone,
	loadSeatingsEditor,
	parsePickedDays,
	parseSeatingsPayload,
	parseVenueCapacity,
	pickedDaysErrorMessage,
	getEventTimeZone,
	saveBookingWindow,
	saveEventSchedule,
	saveServiceSeatings,
	ScheduleSaveRefusedError,
	seatingsPayloadErrorMessage,
	seatingTitle,
	TIME_ZONE_ERROR_MESSAGE,
	VENUE_CAPACITY_ERROR_MESSAGE,
	type ParsedServiceSeatings,
	type PickedServiceDay,
} from '$lib/server/services/event-schedule';
import { clockOf, dayOf, DEFAULT_EVENT_TIME_ZONE, isValidTimeZone, listTimeZones, serviceKindOf, wallClockToInstant } from '$lib/utils/event-time';
import { BOOKING_WINDOW_ERROR_MESSAGES, parseBookingWindow } from '$lib/utils/booking-window';
import { parseServiceRefs, resolveServiceRefs, serviceKey } from '$lib/server/services/new-event-schedule';
import {
	EVENT_TEXT_FIELDS,
	readAskDietaryRequirements,
	readEventTextFields,
	type EventTextFields,
} from '$lib/server/services/event-draft';
import { fillEnglish } from '$lib/server/services/event-translation';
import { translatePricing, type StoredPricingText } from '$lib/server/services/pricing-translation';
import { translateSeatings } from '$lib/server/services/seating-translation';
import { getTranslator, isTranslationEnabled } from '$lib/server/services/translator';
import type { PricingPayload } from '$lib/types/pricing-editor';
import type { EditorService } from '$lib/types/seatings-editor';
import type { PricingEditorData } from '$lib/types/pricing-editor';
import { depositRuleOf } from '$lib/utils/pricing';
import { refundPolicyOf } from '$lib/utils/refund-policy';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { canBeSpotlight, canJoinPortfolio, parseVisibility } from '$lib/utils/event-access';

const SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE = 'Seul un événement Public peut être mis en avant (Spotlight).';
const PORTFOLIO_REQUIRES_OVER_MESSAGE =
	'Un événement ne rejoint le Portfolio qu’une fois sa dernière séance commencée.';
const TRANSLATION_FAILED_MESSAGE =
	'Modifications enregistrées, mais la traduction anglaise a échoué : elle sera retentée au prochain enregistrement.';

/** The Event's saved text fields, which the generated English is checked
 * against (see event-translation.ts). */
async function storedEventText(eventId: string): Promise<EventTextFields> {
	const event = env.USE_MOCK_DATA
		? MOCK_EVENTS.find((e) => e.id === eventId)
		: await (await import('$lib/server/services/events')).getEventById(eventId, { withInternalNotes: true }).catch(() => undefined);
	if (!event) return {};
	const record = event as unknown as Record<string, string | null | undefined>;
	return Object.fromEntries(EVENT_TEXT_FIELDS.map((field) => [field, record[field] ?? null]));
}

/**
 * When the Event's last Seating starts — what Event access needs to decide
 * whether it may join the Portfolio (issue 044). Mock mode has no Seatings
 * table: its Sessions stand in for them.
 */
async function lastSeatingStart(eventId: string): Promise<Date | null> {
	if (env.USE_MOCK_DATA) {
		const starts = MOCK_SESSIONS.filter((s) => s.eventId === eventId).map((s) => s.startTime.getTime());
		return starts.length > 0 ? new Date(Math.max(...starts)) : null;
	}
	const { db } = await import('$lib/server/db');
	const { lastSeatingStartOf } = await import('$lib/server/services/event-access');
	return lastSeatingStartOf(db, eventId);
}

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

/**
 * Save the Time Zone picked in the Lieu section (ADR 0006), before the rest
 * of the Event: a change keeps the Seatings' typed times and is refused
 * once any Seating has a Reservation. Returns the failure to answer with,
 * or null when there is nothing to refuse. An absent field leaves it as is.
 */
async function applyTimeZone(eventId: string, raw: FormDataEntryValue | null) {
	if (raw === null) return null;
	const timeZone = String(raw).trim();
	if (!isValidTimeZone(timeZone)) {
		return fail(400, { error: TIME_ZONE_ERROR_MESSAGE });
	}
	if (env.USE_MOCK_DATA) {
		const mock = MOCK_EVENTS.find((e) => e.id === eventId);
		if (mock) mock.timeZone = timeZone;
		return null;
	}
	try {
		await changeEventTimeZone(eventId, timeZone);
	} catch (refusal) {
		if (refusal instanceof ScheduleSaveRefusedError) {
			return fail(400, { error: refusal.message });
		}
		throw refusal;
	}
	return null;
}

/** « Dates & séances » with its English generated from the French (DeepL). */
async function englishSeatings(services: ParsedServiceSeatings[], stored: EditorService[] | null, eventId: string) {
	const english = await translateSeatings(services, stored, getTranslator());
	if (english.translationFailed) {
		logger.error({ err: english.error, eventId }, 'Seatings English translation failed');
	}
	return english;
}

/** « Menus & tarifs » with its English generated from the French (DeepL). */
async function englishPricing(payload: PricingPayload, stored: StoredPricingText | null, eventId: string) {
	const english = await translatePricing(payload, stored, getTranslator());
	if (english.translationFailed) {
		logger.error({ err: english.error, eventId }, 'Pricing English translation failed');
	}
	return english;
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
					sessionTitle: session ? seatingTitle(session, 'en', { timeZone: event.timeZone }) : '',
					sessionStartTime: session?.startTime?.toISOString() || '',
					paymentStatus: r.paymentStatus,
					isComp: (r as { isComp?: boolean }).isComp ?? false,
					dietaryRequirements: (r as { dietaryRequirements?: string | null }).dietaryRequirements ?? null
				};
			});

		const talents = MOCK_TALENTS.map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }));

		// Mock mode has no Days table: derive them from the mock Seatings,
		// on the Event's clock (same rule as the DB, ADR 0006).
		const zone = event.timeZone;
		const daysMap = new Map<string, PickedServiceDay>();
		for (const session of MOCK_SESSIONS.filter(s => s.eventId === id)) {
			const date = dayOf(session.startTime, zone);
			const kind = serviceKindOf(session.startTime, zone);
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
		const clock = (instant: Date) => clockOf(instant, zone);
		const schedule: EditorService[] = days.flatMap((day, dayIndex) => (['lunch', 'dinner'] as const).filter((kind) => day.kinds.includes(kind)).map((kind, kindIndex) => ({
			serviceId: `00000000-0000-4000-8000-${String(dayIndex * 2 + kindIndex).padStart(12, '0')}`,
			date: day.date,
			kind,
			defaultDurationMinutes: DEFAULT_SERVICE_DURATION_MINUTES[kind],
			seatings: sessions
				.filter((session) =>
					dayOf(session.startTime, zone) === day.date &&
					serviceKindOf(session.startTime, zone) === kind)
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
					heldSeats: session.totalCapacity - session.availableCapacity,
				})),
		})));

		// Mock « Menus & tarifs »: no Menu yet; each synthetic Service is
		// priced like its first mock Seating, in that Seating's currency.
		const pricing: PricingEditorData = {
			menus: [],
			currency: MOCK_SESSIONS.find((session) => session.eventId === id)?.currency ?? 'EUR',
			currencyLocked: reservations.length > 0,
			services: schedule.map((service) => {
				const first = MOCK_SESSIONS.find((session) => session.id === service.seatings[0]?.id);
				return {
					serviceId: service.serviceId,
					date: service.date,
					kind: service.kind,
					menuId: null,
					priceAmount: first?.priceAmount ?? null,
					seatingCount: service.seatings.length,
					legacySeatings: [],
				};
			}),
			deposit: depositRuleOf(event),
			refundPolicy: refundPolicyOf(event),
		};

		// When the Event's last Seating starts (issue 044): what decides
		// whether it may join the Portfolio. Mock mode has no Seatings table,
		// so its Sessions stand in for them.
		const seatingStarts = sessions.map((s) => new Date(s.startTime).getTime());
		const lastSeatingStart = seatingStarts.length > 0 ? new Date(Math.max(...seatingStarts)) : null;

		return { event, sessions, reservations, promoCodes: [], talents, days, schedule, venueCapacity, pricing, timeZones: listTimeZones(), timeZoneLocked: reservations.length > 0, lastSeatingStart, englishAuto: isTranslationEnabled() };
	}

	// Database mode - fetch from database
	const { getEventById } = await import('$lib/server/services/events');
	const { getAllSessionsByEventId } = await import('$lib/server/services/event-sessions');
	const { getPromoCodesForEvent } = await import('$lib/server/services/promo-codes');
	const { db } = await import('$lib/server/db');
	const { reservations } = await import('$lib/server/db/schema');
	const { desc, eq, inArray } = await import('drizzle-orm');

	try {
		// The admin editor is the one place Internal Notes are read (issue 039).
		const event = await getEventById(id, { withInternalNotes: true });
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

		// When the Event's last Seating starts (issue 044): what decides
		// whether it may join the Portfolio. Its Seatings are already loaded.
		const seatingStarts = sessionsData.map((s: typeof sessionsData[number]) => s.startTime.getTime());
		const lastSeatingStart = seatingStarts.length > 0 ? new Date(Math.max(...seatingStarts)) : null;

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
				sessionTitle: seatingTitle(r.eventSession, 'en', { timeZone: event.timeZone }),
				sessionStartTime: r.eventSession.startTime.toISOString(),
				paymentStatus: r.payment?.status || 'none',
				isComp: r.isComp,
				// Dietary Requirements (issue 041): Admins only.
				dietaryRequirements: r.dietaryRequirements
			})),
			eventStaff: [],
			tasks: [],
			allStaff: [],
			// Time Zone picker (Lieu): IANA zones; locked once any Seating
			// has a Reservation (ADR 0006).
			timeZones: listTimeZones(),
			timeZoneLocked: reservationsData.length > 0,
			lastSeatingStart,
			// The English is generated from the French on save (DeepL).
			englishAuto: isTranslationEnabled(),
		};
	} catch (err) {
		if (err instanceof Error && err.message === 'Event not found') {
			throw error(404, 'Event not found');
		}
		throw err;
	}
};

export const actions: Actions = {
	// Save the Essentiel, Lieu or Programme tab: each posts only its own
	// fields, and only those change (ADR 0008 — nothing is required).
	updateEvent: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;

		const formData = await request.formData();
		// The English follows the French (DeepL), unless edited in this save.
		const english = await fillEnglish(
			readEventTextFields(formData),
			await storedEventText(id),
			getTranslator()
		);
		if (english.translationFailed) {
			logger.error({ err: english.error, eventId: id }, 'Event English translation failed');
		}
		const textFields = english.fields;
		const savedMessage = english.translationFailed ? TRANSLATION_FAILED_MESSAGE : 'Modifications enregistrées.';
		// A Draft's autosave shows no success toast, except for this warning.
		const translationWarning = english.translationFailed ? { translationFailed: true as const } : {};
		// The Dietary Requirements switch, from « Infos pratiques » (issue 041).
		const askDietaryRequirements = readAskDietaryRequirements(formData);
		const fields = askDietaryRequirements === undefined ? textFields : { ...textFields, askDietaryRequirements };

		// Visibility, Spotlight and Portfolio are no longer posted here: they
		// belong to the « Publication » control and its own action below
		// (ADR 0010), so saving this tab can never publish the Event. The
		// action ignores them even if a stale form still posts them.

		const timeZoneRefused = await applyTimeZone(id, formData.get('timeZone'));
		if (timeZoneRefused) {
			return timeZoneRefused;
		}

		if (env.USE_MOCK_DATA) {
			// Mock mode - update in mock data array (not persisted)
			const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);

			if (eventIndex === -1) {
				return fail(404, { error: 'Event not found' });
			}

			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				...fields,
				updatedAt: new Date()
			} as typeof MOCK_EVENTS[number];

			return { success: `${savedMessage} (mode démo — non persistées)`, ...translationWarning };
		}

		// Database mode - use actual database functions
		const { updateEvent } = await import('$lib/server/services/events');

		try {
			await updateEvent(id, fields);
			return { success: savedMessage, ...translationWarning };
		} catch (error) {
			const { SpotlightRequiresPublicError, PortfolioRequiresOverEventError } = await import('$lib/server/services/events');
			if (error instanceof SpotlightRequiresPublicError) {
				return fail(400, { error: SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE });
			}
			if (error instanceof PortfolioRequiresOverEventError) {
				return fail(400, { error: PORTFOLIO_REQUIRES_OVER_MESSAGE });
			}
			logger.error({ err: error }, 'Error updating event');
			return fail(500, { error: 'Échec de l’enregistrement de l’événement.' });
		}
	},

	// Publication (ADR 0010): Visibility, Spotlight and Portfolio are saved
	// only here, from their own control in « Essentiel » and never with the
	// Event's text, so that no later autosave of a tab can ever publish an
	// Event. The rules and messages are those of the Essentiel save before:
	// only a Public Event can be the Spotlight (issue 032), an Event joins
	// the Portfolio only once its last Seating has started (issue 044) —
	// `updateEvent` repeats both on the database — and publishing itself is
	// never refused (ADR 0008): « À vérifier » warns, the Admin decides
	// (issue 038's confirmation lives in the control).
	updatePublication: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;

		const formData = await request.formData();
		const visibility = parseVisibility(formData.get('visibility'));
		if (!visibility) {
			return fail(400, { error: 'Visibilité invalide' });
		}
		const isSpotlight = formData.get('isSpotlight') === 'true';
		if (isSpotlight && !canBeSpotlight({ visibility })) {
			return fail(400, { error: SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE });
		}
		const isPortfolio = formData.get('isPortfolio') === 'true';
		if (
			isPortfolio &&
			!canJoinPortfolio(
				{ visibility, isPortfolio, lastSeatingStart: await lastSeatingStart(id) },
				new Date()
			)
		) {
			return fail(400, { error: PORTFOLIO_REQUIRES_OVER_MESSAGE });
		}

		if (env.USE_MOCK_DATA) {
			const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);
			if (eventIndex === -1) {
				return fail(404, { error: 'Event not found' });
			}
			// Only one Spotlight at a time: making an Event the Spotlight
			// takes it from the one that had it.
			if (isSpotlight) {
				MOCK_EVENTS.forEach(e => e.isSpotlight = false);
			}
			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				visibility,
				isSpotlight,
				isPortfolio,
				updatedAt: new Date()
			} as typeof MOCK_EVENTS[number];
			return { success: 'Publication enregistrée (mode démo — non persistée)' };
		}

		const { updateEvent } = await import('$lib/server/services/events');

		try {
			await updateEvent(id, { visibility, isSpotlight, isPortfolio });
			return { success: 'Publication enregistrée.' };
		} catch (error) {
			const { SpotlightRequiresPublicError, PortfolioRequiresOverEventError } = await import('$lib/server/services/events');
			if (error instanceof SpotlightRequiresPublicError) {
				return fail(400, { error: SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE });
			}
			if (error instanceof PortfolioRequiresOverEventError) {
				return fail(400, { error: PORTFOLIO_REQUIRES_OVER_MESSAGE });
			}
			logger.error({ err: error }, 'Error updating publication');
			return fail(500, { error: 'Échec de l’enregistrement de la publication.' });
		}
	},

	// Update media action (Visuels tab).
	updateMedia: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;

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
			const { saveEventVisuals } = await import('$lib/server/services/media');

			// Link the Visuals to the Event, cover first; Event Photos are
			// never touched here (issue 045), nor made the Visual cover.
			const saved = await saveEventVisuals(id, coverMediaId, galleryIds);
			await updateEvent(id, { coverMediaId: coverMediaId && saved.includes(coverMediaId) ? coverMediaId : null });
		} catch (error) {
			logger.error({ err: error }, 'Error updating media');
			return fail(500, { error: 'Échec de la mise à jour des photos' });
		}

		return { success: 'Photos mises à jour' };
	},

	// Save the « Portfolio » tab's Event Photos (issue 045): the ones it
	// holds and which is the project cover. Kept apart from the Visuals.
	updateEventPhotos: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;

		const formData = await request.formData();
		const coverId = formData.get('eventPhotoCoverId')?.toString() || null;
		let photoIds: string[] = [];
		try {
			const parsed = JSON.parse(formData.get('eventPhotoIds')?.toString() || '[]');
			if (Array.isArray(parsed)) photoIds = parsed.filter((value): value is string => typeof value === 'string');
		} catch { /* ignore */ }

		if (env.USE_MOCK_DATA) {
			return { success: 'Photos de l’événement enregistrées (mode démo — non persistées)' };
		}

		try {
			const { saveEventPhotos } = await import('$lib/server/services/media');
			await saveEventPhotos(id, photoIds, coverId);
		} catch (error) {
			logger.error({ err: error }, 'Error saving Event Photos');
			return fail(500, { error: 'Échec de l’enregistrement des photos de l’événement.' });
		}

		return { success: 'Photos de l’événement enregistrées.' };
	},

	// Delete a single photo immediately
	deletePhoto: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;

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
	// meal by `serviceRefs`.
	saveSeatings: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const { id } = params;
		const formData = await request.formData();

		const pickedDays = parsePickedDays(
			typeof formData.get('days') === 'string' ? formData.get('days') as string : null
		);
		// A Draft starts with no Days (ADR 0010): the tab saves without one
		// until a Day is saved; removing every saved Day is still refused.
		let days: PickedServiceDay[];
		if (pickedDays.ok) {
			days = pickedDays.days;
		} else if (pickedDays.reason === 'empty' && (env.USE_MOCK_DATA || (await loadScheduleDays(id)).length === 0)) {
			days = [];
		} else {
			return fail(400, { error: pickedDaysErrorMessage(pickedDays.reason) });
		}
		const rawRefs = formData.get('serviceRefs');
		const refs = parseServiceRefs(typeof rawRefs === 'string' ? rawRefs : null, days);
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

		// The Booking Window (issue 035): the opening is typed on the
		// Event's clock; both settings may be left empty.
		let timeZone = DEFAULT_EVENT_TIME_ZONE;
		if (env.USE_MOCK_DATA) {
			timeZone = MOCK_EVENTS.find((e: typeof MOCK_EVENTS[number]) => e.id === id)?.timeZone ?? timeZone;
		} else {
			const eventTimeZone = await getEventTimeZone(id).catch(() => null);
			if (!eventTimeZone) {
				return fail(404, { error: 'Événement introuvable.' });
			}
			timeZone = eventTimeZone;
		}
		const rawOpensAt = formData.get('bookingOpensAt');
		const rawClosesHoursBefore = formData.get('bookingClosesHoursBefore');
		const bookingWindow = parseBookingWindow(
			typeof rawOpensAt === 'string' ? rawOpensAt : null,
			typeof rawClosesHoursBefore === 'string' ? rawClosesHoursBefore : null,
			(day, minutes) => wallClockToInstant(day, minutes, timeZone)
		);
		if (!bookingWindow.ok) {
			return fail(400, { error: BOOKING_WINDOW_ERROR_MESSAGES[bookingWindow.reason] });
		}

		if (env.USE_MOCK_DATA) {
			return { success: 'Séances enregistrées (mode démo — non persistées)' };
		}

		try {
			// The Seatings' English follows their French (DeepL), compared
			// with what is saved before anything changes.
			const english = await englishSeatings(parsed.services, await loadSeatingsEditor(id), id);

			// The Days first: this refuses to remove a Day or Service that
			// still has Reservations, and recomputes the Event's start/end
			// dates from its first and last Day.
			await saveEventSchedule(id, days);

			// Then the Seatings, with the placeholders swapped for the
			// Services just created; saved Services keep their id.
			const realIds = new Map(
				(await loadSeatingsEditor(id)).map((service) => [serviceKey(service.date, service.kind), service.serviceId])
			);
			const placeholderIds = new Set(refs.map((ref) => ref.ref));
			const services = [
				...english.value.filter((service) => !placeholderIds.has(service.serviceId)),
				...resolveServiceRefs(english.value.filter((service) => placeholderIds.has(service.serviceId)), refs, realIds),
			];
			const result = await saveServiceSeatings(id, services, venue.venueCapacity);
			await saveBookingWindow(id, bookingWindow.window);

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
			const translation = english.translationFailed
				? ' La traduction anglaise a échoué : elle sera retentée au prochain enregistrement.'
				: '';
			// The new Seatings' ids, for the editor's drafts (issue 019); a
			// Draft's autosave shows no success toast, except for the
			// translation warning (overlaps are flagged in the editor).
			return {
				success: `Séances enregistrées.${warning}${translation}`,
				seatingIds: result.seatingIds,
				...(english.translationFailed ? { translationFailed: true as const } : {}),
			};
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
		const formData = await request.formData();

		const { parsePricingPayload, pricingPayloadErrorMessage, savePricing } = await import(
			'$lib/server/services/service-pricing'
		);
		const raw = formData.get('pricing');
		const parsed = parsePricingPayload(typeof raw === 'string' ? raw : null);
		if (!parsed.ok) {
			return fail(400, { error: pricingPayloadErrorMessage(parsed.reason) });
		}

		if (env.USE_MOCK_DATA) {
			return { success: 'Menus et tarifs enregistrés (mode démo — non persistés)' };
		}

		try {
			const { loadPricingEditor } = await import('$lib/server/services/service-pricing');
			const english = await englishPricing(parsed.payload, await loadPricingEditor(id), id);
			const { menuIds } = await savePricing(id, english.value);
			// The new Menus' ids, for the editor's drafts (issue 019); a
			// Draft's autosave shows no success toast, except for this warning.
			return {
				success: english.translationFailed
					? 'Menus et tarifs enregistrés, mais la traduction anglaise a échoué : elle sera retentée au prochain enregistrement.'
					: 'Menus et tarifs enregistrés.',
				menuIds,
				...(english.translationFailed ? { translationFailed: true as const } : {}),
			};
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

		if (env.USE_MOCK_DATA) {
			return { success: 'Code promo créé (mode démo — non persisté)' };
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const code = formData.get('code')?.toString().trim();
		const discountType = formData.get('discountType')?.toString();
		const discountValueRaw = formData.get('discountValue')?.toString();
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

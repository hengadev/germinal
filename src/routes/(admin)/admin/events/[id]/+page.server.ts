import { fail, redirect, error, type Actions, type ServerLoad } from '@sveltejs/kit';
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
import { parseServiceRefs, refersOnlyTo, resolveServiceRefs, serviceKey } from '$lib/server/services/new-event-schedule';
import {
	createDraftEvent,
	EVENT_TEXT_FIELDS,
	hasEventText,
	NOTHING_TO_SAVE_MESSAGE,
	pricingHasContent,
	readAskDietaryRequirements,
	readEventTextFields,
	type EventTextFields,
} from '$lib/server/services/event-draft';
import { fillEnglish } from '$lib/server/services/event-translation';
import { translatePricing, type StoredPricingText } from '$lib/server/services/pricing-translation';
import { translateSeatings } from '$lib/server/services/seating-translation';
import { getTranslator, isTranslationEnabled } from '$lib/server/services/translator';
import type { CreateEventInput } from '$lib/types/events';
import type { PricingPayload } from '$lib/types/pricing-editor';
import type { EditorService } from '$lib/types/seatings-editor';
import type { PricingEditorData } from '$lib/types/pricing-editor';
import { depositRuleOf } from '$lib/utils/pricing';
import { refundPolicyOf } from '$lib/utils/refund-policy';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth-guards';
import { canBeSpotlight, canJoinPortfolio, parseVisibility, type Visibility } from '$lib/utils/event-access';

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

/**
 * The Time Zone posted with a new Event's first save: the default one when
 * absent or blank, null when it is not an IANA name.
 */
function parseNewEventTimeZone(raw: FormDataEntryValue | null): string | null {
	const timeZone = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : DEFAULT_EVENT_TIME_ZONE;
	return isValidTimeZone(timeZone) ? timeZone : null;
}

/**
 * Create the Draft a new Event's first save lands on (ADR 0008, issue 036),
 * with what that save holds. Returns its id.
 */
async function createDraft(input: CreateEventInput): Promise<string> {
	if (env.USE_MOCK_DATA) {
		const id = crypto.randomUUID();
		const blank = Object.fromEntries(EVENT_TEXT_FIELDS.map((field) => [field, null]));
		MOCK_EVENTS.push({
			...blank,
			startDate: null,
			endDate: null,
			timeZone: DEFAULT_EVENT_TIME_ZONE,
			coverMediaId: null,
			coverMedia: null,
			media: [],
			isPortfolio: false,
			...input,
			id,
			visibility: 'draft',
			isSpotlight: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as unknown as typeof MOCK_EVENTS[number]);
		return id;
	}
	return createDraftEvent(input);
}

/** « Dates & séances » with its English generated from the French (DeepL). */
async function englishSeatings(services: ParsedServiceSeatings[], stored: EditorService[] | null, eventId: string | null) {
	const english = await translateSeatings(services, stored, getTranslator());
	if (english.translationFailed) {
		logger.error({ err: english.error, eventId }, 'Seatings English translation failed');
	}
	return english;
}

/** « Menus & tarifs » with its English generated from the French (DeepL). */
async function englishPricing(payload: PricingPayload, stored: StoredPricingText | null, eventId: string | null) {
	const english = await translatePricing(payload, stored, getTranslator());
	if (english.translationFailed) {
		logger.error({ err: english.error, eventId }, 'Pricing English translation failed');
	}
	return english;
}

/** Where a new Event's first save lands: the Draft's own page. */
function draftPage(id: string): string {
	return `/admin/events/${id}`;
}

const SERVICE_REFS_MISMATCH_MESSAGE = 'Les repas des séances et des tarifs ne correspondent pas aux jours sélectionnés.';

/**
 * First save of « Dates & séances » or « Menus & tarifs » on a new Event
 * (issue 036): both tabs post the Days and meals picked, the Seatings and
 * the pricing together, the meals being named by placeholder ids (see
 * new-event-schedule.ts), with the Time Zone picked in Lieu. Everything is
 * checked before the Draft is created, and nothing is left half-created
 * when a save is refused.
 */
async function saveNewEventSchedule(formData: FormData) {
	const rawDays = formData.get('days');
	const pickedDays = parsePickedDays(typeof rawDays === 'string' ? rawDays : null);
	let days: PickedServiceDay[] = [];
	if (pickedDays.ok) {
		days = pickedDays.days;
	} else if (pickedDays.reason !== 'missing' && pickedDays.reason !== 'empty') {
		// A Draft may have no Days; a malformed pick is still refused.
		return fail(400, { error: pickedDaysErrorMessage(pickedDays.reason) });
	}
	const rawRefs = formData.get('serviceRefs');
	const refs = parseServiceRefs(typeof rawRefs === 'string' ? rawRefs : null, days);
	if (!refs) {
		return fail(400, { error: SERVICE_REFS_MISMATCH_MESSAGE });
	}
	const rawSeatings = formData.get('services');
	let seatingServices: ParsedServiceSeatings[] = [];
	if (typeof rawSeatings === 'string' && rawSeatings.trim() !== '') {
		const parsedSeatings = parseSeatingsPayload(rawSeatings);
		if (!parsedSeatings.ok) {
			return fail(400, { error: seatingsPayloadErrorMessage(parsedSeatings.reason) });
		}
		// A new Event: nothing is saved yet to compare the French with.
		seatingServices = (await englishSeatings(parsedSeatings.services, null, null)).value;
	}
	const { parsePricingPayload, pricingPayloadErrorMessage, savePricing } = await import(
		'$lib/server/services/service-pricing'
	);
	const rawPricing = formData.get('pricing');
	let pricing: PricingPayload | null = null;
	if (typeof rawPricing === 'string' && rawPricing.trim() !== '') {
		const parsedPricing = parsePricingPayload(rawPricing);
		if (!parsedPricing.ok) {
			return fail(400, { error: pricingPayloadErrorMessage(parsedPricing.reason) });
		}
		// A new Event: nothing is saved yet to compare the French with.
		pricing = (await englishPricing(parsedPricing.payload, null, null)).value;
	}
	if (!refersOnlyTo(seatingServices, refs) || (pricing && !refersOnlyTo(pricing.services, refs))) {
		return fail(400, { error: SERVICE_REFS_MISMATCH_MESSAGE });
	}
	const rawVenueCapacity = formData.get('venueCapacity');
	const venue = parseVenueCapacity(typeof rawVenueCapacity === 'string' ? rawVenueCapacity : null);
	if (!venue.ok) {
		return fail(400, { error: VENUE_CAPACITY_ERROR_MESSAGE });
	}
	// The Seatings' times are typed on the venue's clock (ADR 0006).
	const timeZone = parseNewEventTimeZone(formData.get('timeZone'));
	if (!timeZone) {
		return fail(400, { error: TIME_ZONE_ERROR_MESSAGE });
	}
	// The Booking Window (issue 035), its opening typed on that clock too.
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
	const { opensAt, closesHoursBefore } = bookingWindow.window;

	if (
		days.length === 0 &&
		venue.venueCapacity === undefined &&
		opensAt === null &&
		closesHoursBefore === null &&
		!(pricing && pricingHasContent(pricing))
	) {
		return fail(400, { error: NOTHING_TO_SAVE_MESSAGE });
	}

	const id = await createDraft({ timeZone, venueCapacity: venue.venueCapacity ?? null });
	if (env.USE_MOCK_DATA) {
		redirect(303, draftPage(id));
	}

	try {
		if (days.length > 0) {
			// The Days first; this also sets the Event's start/end dates.
			await saveEventSchedule(id, days);
		}
		// Then the Seatings and pricing, on the Services just created.
		const realIds = new Map(
			(await loadSeatingsEditor(id)).map((service) => [serviceKey(service.date, service.kind), service.serviceId])
		);
		if (seatingServices.length > 0) {
			await saveServiceSeatings(id, resolveServiceRefs(seatingServices, refs, realIds), venue.venueCapacity);
		}
		if (pricing) {
			await savePricing(id, { ...pricing, services: resolveServiceRefs(pricing.services, refs, realIds) });
		}
		await saveBookingWindow(id, bookingWindow.window);
	} catch (err) {
		// Nothing half-created: the Draft goes, with its Days, Services,
		// Seatings and Menus (cascade).
		const { deleteEvent } = await import('$lib/server/services/events');
		await deleteEvent(id);
		if (err instanceof ScheduleSaveRefusedError) {
			return fail(400, { error: err.message });
		}
		logger.error({ err }, 'Save new event schedule error');
		return fail(500, { error: 'Échec de l’enregistrement des séances et des tarifs : le brouillon n’a pas été créé.' });
	}

	redirect(303, draftPage(id));
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
	// fields, and only those change (ADR 0008 — nothing is required). On a
	// new Event (no id), the first save creates the Draft with them.
	updateEvent: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const id = params.id ?? null;

		const formData = await request.formData();
		// The English follows the French (DeepL), unless edited in this save.
		const english = await fillEnglish(
			readEventTextFields(formData),
			id ? await storedEventText(id) : {},
			getTranslator()
		);
		if (english.translationFailed) {
			logger.error({ err: english.error, eventId: id }, 'Event English translation failed');
		}
		const textFields = english.fields;
		const savedMessage = english.translationFailed ? TRANSLATION_FAILED_MESSAGE : 'Modifications enregistrées.';
		// The Dietary Requirements switch, from « Infos pratiques » (issue 041).
		const askDietaryRequirements = readAskDietaryRequirements(formData);
		const fields = askDietaryRequirements === undefined ? textFields : { ...textFields, askDietaryRequirements };

		// Visibility, Spotlight and Portfolio come with the Essentiel tab of
		// a saved Event; other tabs leave them as they are.
		let publishing: { visibility: Visibility; isSpotlight: boolean; isPortfolio: boolean } | undefined;
		if (id && formData.has('visibility')) {
			const visibility = parseVisibility(formData.get('visibility'));
			if (!visibility) {
				return fail(400, { error: 'Visibilité invalide' });
			}
			const isSpotlight = formData.get('isSpotlight') === 'true';
			// Only a Public Event can be the Spotlight (issue 032).
			if (isSpotlight && !canBeSpotlight({ visibility })) {
				return fail(400, { error: SPOTLIGHT_REQUIRES_PUBLIC_MESSAGE });
			}
			const isPortfolio = formData.get('isPortfolio') === 'true';
			// The Portfolio (issue 044): an Event joins it only once its last
			// Seating has started. updateEvent refuses it again on the database.
			if (isPortfolio && !canJoinPortfolio({ visibility, isPortfolio, lastSeatingStart: await lastSeatingStart(id) }, new Date())) {
				return fail(400, { error: PORTFOLIO_REQUIRES_OVER_MESSAGE });
			}
			publishing = { visibility, isSpotlight, isPortfolio };

			// Publishing is never refused (ADR 0008, which supersedes ADR 0001):
			// an Event without a Seating is announced but not bookable, and the
			// editor's « À vérifier » list shows the gap (issue 038).
		}

		if (!id) {
			const timeZone = parseNewEventTimeZone(formData.get('timeZone'));
			if (!timeZone) {
				return fail(400, { error: TIME_ZONE_ERROR_MESSAGE });
			}
			// The Time Zone alone counts once it is not the default one.
			// So does the Dietary Requirements switch once turned on.
			if (!hasEventText(textFields) && !askDietaryRequirements && timeZone === DEFAULT_EVENT_TIME_ZONE) {
				return fail(400, { error: NOTHING_TO_SAVE_MESSAGE });
			}
			const created = await createDraft({ ...fields, timeZone });
			redirect(303, draftPage(created));
		}

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

			// If isSpotlight is true, unset others in mock array
			if (publishing?.isSpotlight) {
				MOCK_EVENTS.forEach(e => e.isSpotlight = false);
			}

			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				...fields,
				...publishing,
				updatedAt: new Date()
			} as typeof MOCK_EVENTS[number];

			return { success: `${savedMessage} (mode démo — non persistées)` };
		}

		// Database mode - use actual database functions
		const { updateEvent } = await import('$lib/server/services/events');

		try {
			await updateEvent(id, { ...fields, ...publishing });
			return { success: savedMessage };
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

	// Update media action (Visuels tab). On a new Event (no id), the first
	// save creates the Draft with the uploaded Visuals.
	updateMedia: async ({ request, params, locals }) => {
		requireAdmin(locals);

		const formData = await request.formData();
		const coverMediaId = formData.get('coverMediaId')?.toString() || null;
		const galleryMediaIdsRaw = formData.get('galleryMediaIds')?.toString() || null;

		let galleryIds: string[] = [];
		try { galleryIds = galleryMediaIdsRaw ? JSON.parse(galleryMediaIdsRaw) : []; } catch { /* ignore */ }

		if (!params.id && !coverMediaId && galleryIds.length === 0) {
			return fail(400, { error: NOTHING_TO_SAVE_MESSAGE });
		}
		const id = params.id ?? await createDraft({});

		if (env.USE_MOCK_DATA) {
			const eventIndex = MOCK_EVENTS.findIndex((e) => e.id === id);
			if (eventIndex === -1) return fail(404, { error: 'Event not found' });
			MOCK_EVENTS[eventIndex] = {
				...MOCK_EVENTS[eventIndex],
				coverMediaId: coverMediaId || null,
				updatedAt: new Date()
			} as typeof MOCK_EVENTS[number];
			if (!params.id) redirect(303, draftPage(id));
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
			if (!params.id) {
				const { deleteEvent } = await import('$lib/server/services/events');
				await deleteEvent(id);
			}
			return fail(500, { error: 'Échec de la mise à jour des photos' });
		}

		if (!params.id) redirect(303, draftPage(id));
		return { success: 'Photos mises à jour' };
	},

	// Save the « Portfolio » tab's Event Photos (issue 045): the ones it
	// holds and which is the project cover. Kept apart from the Visuals. On
	// a new Event (no id), the first save creates the Draft with them.
	updateEventPhotos: async ({ request, params, locals }) => {
		requireAdmin(locals);

		const formData = await request.formData();
		const coverId = formData.get('eventPhotoCoverId')?.toString() || null;
		let photoIds: string[] = [];
		try {
			const parsed = JSON.parse(formData.get('eventPhotoIds')?.toString() || '[]');
			if (Array.isArray(parsed)) photoIds = parsed.filter((value): value is string => typeof value === 'string');
		} catch { /* ignore */ }

		if (!params.id && photoIds.length === 0) {
			return fail(400, { error: NOTHING_TO_SAVE_MESSAGE });
		}
		const id = params.id ?? await createDraft({});

		if (env.USE_MOCK_DATA) {
			if (!params.id) redirect(303, draftPage(id));
			return { success: 'Photos de l’événement enregistrées (mode démo — non persistées)' };
		}

		try {
			const { saveEventPhotos } = await import('$lib/server/services/media');
			await saveEventPhotos(id, photoIds, coverId);
		} catch (error) {
			logger.error({ err: error }, 'Error saving Event Photos');
			if (!params.id) {
				const { deleteEvent } = await import('$lib/server/services/events');
				await deleteEvent(id);
			}
			return fail(500, { error: 'Échec de l’enregistrement des photos de l’événement.' });
		}

		if (!params.id) redirect(303, draftPage(id));
		return { success: 'Photos de l’événement enregistrées.' };
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
		const formData = await request.formData();
		// A new Event: the first save creates the Draft (issue 036).
		if (!id) {
			return saveNewEventSchedule(formData);
		}

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
			await saveEventSchedule(id, pickedDays.days);

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
			return { success: `Séances enregistrées.${warning}${translation}` };
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
		// A new Event: the first save creates the Draft (issue 036).
		if (!id) {
			return saveNewEventSchedule(formData);
		}

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
			await savePricing(id, english.value);
			return {
				success: english.translationFailed
					? 'Menus et tarifs enregistrés, mais la traduction anglaise a échoué : elle sera retentée au prochain enregistrement.'
					: 'Menus et tarifs enregistrés.',
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
		if (!eventId) return fail(400, { error: 'Event ID is required' });

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

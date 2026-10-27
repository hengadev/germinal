import type { CreateEventInput } from '$lib/types/events';
import type { PricingPayload } from '$lib/types/pricing-editor';
import { FULL_PAYMENT_DEPOSIT } from '$lib/utils/pricing';
import { DEFAULT_REFUND_POLICY } from '$lib/utils/refund-policy';
import { DEFAULT_EVENT_CURRENCY } from '$lib/utils/currency';
import { DEFAULT_EVENT_TIME_ZONE } from '$lib/utils/event-time';

/**
 * Drafts (ADR 0008, ADR 0010): « Nouvel événement » creates an empty Draft
 * at once and opens its editor; each tab then saves its own fields onto it,
 * nothing being required.
 */

/** The Event's own text fields, as posted by the Essentiel (with the
 * Internal Notes, issue 039), Lieu, Programme, Infos pratiques and
 * Portfolio tabs (each posts only its own). */
export const EVENT_TEXT_FIELDS = [
	'titleEn',
	'titleFr',
	'subtitleEn',
	'subtitleFr',
	'descriptionEn',
	'descriptionFr',
	'locationEn',
	'locationFr',
	'venueNameEn',
	'venueNameFr',
	'streetAddressEn',
	'streetAddressFr',
	'districtEn',
	'districtFr',
	'cityEn',
	'cityFr',
	'postalCode',
	'countryEn',
	'countryFr',
	'collaborators',
	'timings',
	'curatorEn',
	'curatorFr',
	'admissionInfoEn',
	'admissionInfoFr',
	'internalNotes',
	'practicalInfoEn',
	'practicalInfoFr',
	// The Recap (issue 045), from the « Portfolio » tab.
	'recapEn',
	'recapFr',
] as const;

export type EventTextField = (typeof EVENT_TEXT_FIELDS)[number];
export type EventTextFields = Partial<Record<EventTextField, string | null>>;

/** Fields posted as a JSON list, where an empty list means nothing. */
const LIST_FIELDS: ReadonlySet<EventTextField> = new Set(['collaborators', 'timings']);

/**
 * The text fields present in a tab's form: a blank one is null (cleared),
 * as is an empty Collaborators or Programme list. Fields the tab does not
 * post are left out, so saving one tab never touches another's fields.
 */
export function readEventTextFields(formData: FormData): EventTextFields {
	const fields: EventTextFields = {};
	for (const name of EVENT_TEXT_FIELDS) {
		if (!formData.has(name)) continue;
		const raw = formData.get(name);
		const value = typeof raw === 'string' ? raw : '';
		const blank = value.trim() === '' || (LIST_FIELDS.has(name) && value.trim() === '[]');
		fields[name] = blank ? null : value;
	}
	return fields;
}

/** The « Infos pratiques » switch « Demander les allergies et régimes
 * alimentaires » (issue 041). The tab posts a hidden `false` before the
 * checkbox's `true`, so the field is present whenever the tab is saved;
 * a tab that does not post it leaves the switch alone (undefined). */
export function readAskDietaryRequirements(formData: FormData): boolean | undefined {
	if (!formData.has('askDietaryRequirements')) return undefined;
	return formData.getAll('askDietaryRequirements').includes('true');
}

/** Whether any of the fields holds a value. */
export function hasEventText(fields: EventTextFields): boolean {
	return Object.values(fields).some((value) => value !== null && value !== undefined);
}

function sameTiers(a: readonly { hoursBefore: number; percent: number }[], b: readonly { hoursBefore: number; percent: number }[]): boolean {
	return a.length === b.length && a.every((tier, i) => tier.hoursBefore === b[i].hoursBefore && tier.percent === b[i].percent);
}

/**
 * Whether a « Menus & tarifs » payload holds anything beyond what a new
 * Event gets anyway: a Menu, a Service's Menu or price, a currency other
 * than EUR, a Deposit other than full payment, or a Refund Policy other than
 * the default one.
 */
export function pricingHasContent(payload: PricingPayload): boolean {
	if (payload.menus.length > 0) return true;
	if (payload.currency !== undefined && payload.currency !== DEFAULT_EVENT_CURRENCY) return true;
	if (payload.services.some((service) => service.menuKey !== null || service.priceAmount !== null)) return true;
	const deposit = payload.deposit;
	if (deposit && (deposit.type !== FULL_PAYMENT_DEPOSIT.type || deposit.value !== FULL_PAYMENT_DEPOSIT.value)) {
		return true;
	}
	const refund = payload.refundPolicy;
	if (
		refund &&
		(refund.type !== DEFAULT_REFUND_POLICY.type ||
			(refund.textEn ?? '').trim() !== '' ||
			(refund.textFr ?? '').trim() !== '' ||
			!sameTiers(refund.tiers, DEFAULT_REFUND_POLICY.tiers))
	) {
		return true;
	}
	return false;
}

/** How long the sweep job waits before deleting an untouched empty
 * Draft (issue 015). */
export const EMPTY_DRAFT_IDLE_HOURS = 24;

/** What the emptiness check reads off an Event's other tables. */
export type DraftContentCounts = {
	/** Days picked on the Event. */
	days: number;
	/** Services on those Days, priced or not. */
	services: number;
	/** Seatings of those Services (plus any legacy ones). */
	seatings: number;
	/** Menus described on the Event. */
	menus: number;
	/** Services offering a Menu or holding a price. */
	pricedServices: number;
	/** Visuals and Event Photos linked to the Event. */
	media: number;
	/** Promo Codes, staff and tasks: a Draft's operational records, which
	 * deleting it would take with it (cascade). */
	coupons: number;
	staff: number;
	tasks: number;
};

/** An Event row as the emptiness check reads it. */
export type EmptyDraftEvent = {
	visibility?: string | null;
	timeZone?: string | null;
	coverMediaId?: string | null;
	coverVideoId?: string | null;
	// « Dates & séances », « Menus & tarifs » and « Infos pratiques »
	// settings: set once they differ from what a new Event starts with.
	venueCapacity?: number | null;
	bookingOpensAt?: Date | string | null;
	bookingClosesHoursBefore?: number | null;
	askDietaryRequirements?: boolean | null;
	currency?: string | null;
	depositType?: string | null;
	depositValue?: number | null;
	refundPolicyType?: string | null;
	refundPolicyTextEn?: string | null;
	refundPolicyTextFr?: string | null;
	refundPolicyTiers?: unknown;
} & Partial<Record<EventTextField, string | null>>;

/** Whether `tiers` are the refund tiers a new Event starts with — compared
 * field by field, since jsonb does not keep key order. */
function isDefaultRefundTiers(tiers: unknown): boolean {
	const defaults = DEFAULT_REFUND_POLICY.tiers;
	return (
		Array.isArray(tiers) &&
		tiers.length === defaults.length &&
		tiers.every(
			(tier, i) => tier?.hoursBefore === defaults[i].hoursBefore && tier?.percent === defaults[i].percent
		)
	);
}

/** Whether a setting of the Event was changed from a new Event's. */
function hasSettings(event: EmptyDraftEvent): boolean {
	return (
		event.venueCapacity != null ||
		event.bookingOpensAt != null ||
		event.bookingClosesHoursBefore != null ||
		event.askDietaryRequirements === true ||
		(event.currency != null && event.currency !== DEFAULT_EVENT_CURRENCY) ||
		(event.depositType != null && event.depositType !== FULL_PAYMENT_DEPOSIT.type) ||
		(event.depositValue != null && event.depositValue !== FULL_PAYMENT_DEPOSIT.value) ||
		(event.refundPolicyType != null && event.refundPolicyType !== DEFAULT_REFUND_POLICY.type) ||
		!!event.refundPolicyTextEn?.trim() ||
		!!event.refundPolicyTextFr?.trim() ||
		(event.refundPolicyTiers != null && !isDefaultRefundTiers(event.refundPolicyTiers))
	);
}

/**
 * Whether the Event is an empty Draft (issue 015, ADR 0010): no text in
 * any language, no Internal Notes, no Day, Service or Seating, no Visual
 * or Event Photo, no Menu or price, no setting changed from a new Event's
 * (capacity, Booking Window, payment and refund terms, Dietary
 * Requirements), no Promo Code, staff or task, and the default Time Zone. Anything
 * filled in keeps it, and a Private or Public Event is never empty.
 */
export function isEmptyDraftEvent(event: EmptyDraftEvent, content: DraftContentCounts): boolean {
	if (event.visibility !== 'draft') return false;
	if (event.timeZone !== DEFAULT_EVENT_TIME_ZONE) return false;
	// A chosen cover is a Visual, even if its media row went missing.
	if (event.coverMediaId != null || event.coverVideoId != null) return false;
	const texts = Object.fromEntries(EVENT_TEXT_FIELDS.map((field) => [field, event[field] ?? null]));
	if (hasEventText(texts)) return false;
	if (hasSettings(event)) return false;
	return (
		content.days === 0 &&
		content.services === 0 &&
		content.seatings === 0 &&
		content.menus === 0 &&
		content.pricedServices === 0 &&
		content.media === 0 &&
		content.coupons === 0 &&
		content.staff === 0 &&
		content.tasks === 0
	);
}

/** The Event's content counts, as `isEmptyDraftEvent` reads them. */
async function draftContentCounts(
	db: typeof import('../db')['db'],
	eventId: string
): Promise<DraftContentCounts> {
	const { coupons, eventDays, eventMenus, eventServices, eventSessions, eventStaff, media, tasks } = await import('../db/schema');
	const { and, eq, isNotNull, or, sql } = await import('drizzle-orm');

	const count = sql<number>`count(*)::int`;
	const [days, services, seatings, menus, priced, linkedMedia, promoCodes, staff, eventTasks] = await Promise.all([
		db.select({ count }).from(eventDays).where(eq(eventDays.eventId, eventId)),
		db.select({ count })
			.from(eventServices)
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(eq(eventDays.eventId, eventId)),
		db.select({ count }).from(eventSessions).where(eq(eventSessions.eventId, eventId)),
		db.select({ count }).from(eventMenus).where(eq(eventMenus.eventId, eventId)),
		db.select({ count })
			.from(eventServices)
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(and(eq(eventDays.eventId, eventId), or(isNotNull(eventServices.menuId), isNotNull(eventServices.priceAmount)))),
		db.select({ count }).from(media).where(eq(media.eventId, eventId)),
		db.select({ count }).from(coupons).where(eq(coupons.eventId, eventId)),
		db.select({ count }).from(eventStaff).where(eq(eventStaff.eventId, eventId)),
		db.select({ count }).from(tasks).where(eq(tasks.eventId, eventId)),
	]);
	return {
		days: days[0]?.count ?? 0,
		services: services[0]?.count ?? 0,
		seatings: seatings[0]?.count ?? 0,
		menus: menus[0]?.count ?? 0,
		pricedServices: priced[0]?.count ?? 0,
		media: linkedMedia[0]?.count ?? 0,
		coupons: promoCodes[0]?.count ?? 0,
		staff: staff[0]?.count ?? 0,
		tasks: eventTasks[0]?.count ?? 0,
	};
}

/**
 * Delete the Event when it is an empty Draft — the check the editor's
 * leave endpoint and the sweep job share (issue 015). A non-empty or
 * non-Draft Event is never deleted: the Event row is locked for the
 * check, so nothing can be saved between what is read and what is
 * deleted. Returns whether it deleted.
 */
export async function deleteEmptyDraft(eventId: string): Promise<boolean> {
	const { db } = await import('../db');
	const { events } = await import('../db/schema');
	const { eq } = await import('drizzle-orm');

	let deleted = false;
	await db.transaction(async (tx: typeof db) => {
		const [event] = await tx
			.select()
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1)
			.for('update');
		if (!event || !isEmptyDraftEvent(event, await draftContentCounts(tx, eventId))) return;
		deleted = (await tx.delete(events).where(eq(events.id, eventId)).returning({ id: events.id })).length > 0;
	});
	if (deleted) {
		const { invalidateCacheTags, CACHE_TAGS } = await import('../cache');
		invalidateCacheTags([CACHE_TAGS.EVENTS]);
	}
	return deleted;
}

/**
 * Create a Draft. Always a Draft, never the Spotlight (issue 032);
 * everything else may be missing. Returns its id.
 */
export async function createDraftEvent(input: CreateEventInput = {}): Promise<string> {
	const { createEvent } = await import('./events');
	const event = await createEvent({ ...input, visibility: 'draft', isSpotlight: false });
	return event.id;
}

import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventMenus, eventServices, eventSessions, events } from '../db/schema';
import { recomputeEventDatesFromDays, type PickedServiceDay } from './event-schedule';
import { planSchedulePattern, servedKinds, type PatternSourceService } from '$lib/utils/schedule-pattern';
import type { ServiceKind } from '$lib/utils/event-time';

/**
 * « Dupliquer » (issue 046): copy an Event onto new Days as a Draft, in
 * one transaction. The copy carries the texts (titles prefixed « Copie
 * de »), venue, Venue Capacity, Time Zone, currency, Menus, Deposit, Refund
 * Policy, Programme, Collaborators, the Booking Window's closing hours and
 * the Dietary Requirements switch; each new Service gets the source's
 * pattern for its meal (the Schedule pattern module). It never carries
 * Visuals, Event Photos, the Recap, the Portfolio flag, the Spotlight,
 * Reservations, the Waitlist, Promo Codes, Tasks, Staff assignments or the
 * booking opening date.
 */

/** French admin copy when the Event to duplicate does not exist. */
export const DUPLICATE_SOURCE_MISSING_MESSAGE = 'L’événement à dupliquer est introuvable.';

export class DuplicateSourceMissingError extends Error {
	constructor() {
		super(DUPLICATE_SOURCE_MISSING_MESSAGE);
		this.name = 'DuplicateSourceMissingError';
	}
}

const TITLE_MAX_LENGTH = 255;

function prefixed(prefix: string, title: string | null): string | null {
	if (title === null || title.trim() === '') return null;
	return `${prefix}${title}`.slice(0, TITLE_MAX_LENGTH);
}

/** The copy's titles: « Copie de … » (and « Copy of … » in English). */
export function duplicateTitles(source: { titleEn: string | null; titleFr: string | null }): {
	titleEn: string | null;
	titleFr: string | null;
} {
	return {
		titleFr: prefixed('Copie de ', source.titleFr ?? source.titleEn),
		titleEn: prefixed('Copy of ', source.titleEn),
	};
}

/** Create the Draft copy of `sourceId` on the picked Days; returns its id. */
export async function duplicateEvent(sourceId: string, days: PickedServiceDay[]): Promise<string> {
	return await db.transaction(async (tx: typeof db) => {
		const [source] = await tx.select().from(events).where(eq(events.id, sourceId)).limit(1);
		if (!source) {
			throw new DuplicateSourceMissingError();
		}

		const [copy] = await tx.insert(events).values({
			...duplicateTitles(source),
			subtitleEn: source.subtitleEn,
			subtitleFr: source.subtitleFr,
			descriptionEn: source.descriptionEn,
			descriptionFr: source.descriptionFr,
			admissionInfoEn: source.admissionInfoEn,
			admissionInfoFr: source.admissionInfoFr,
			practicalInfoEn: source.practicalInfoEn,
			practicalInfoFr: source.practicalInfoFr,
			internalNotes: source.internalNotes,
			locationEn: source.locationEn,
			locationFr: source.locationFr,
			venueNameEn: source.venueNameEn,
			venueNameFr: source.venueNameFr,
			streetAddressEn: source.streetAddressEn,
			streetAddressFr: source.streetAddressFr,
			districtEn: source.districtEn,
			districtFr: source.districtFr,
			cityEn: source.cityEn,
			cityFr: source.cityFr,
			postalCode: source.postalCode,
			countryEn: source.countryEn,
			countryFr: source.countryFr,
			venueCapacity: source.venueCapacity,
			timeZone: source.timeZone,
			currency: source.currency,
			depositType: source.depositType,
			depositValue: source.depositValue,
			refundPolicyType: source.refundPolicyType,
			refundPolicyTextEn: source.refundPolicyTextEn,
			refundPolicyTextFr: source.refundPolicyTextFr,
			refundPolicyTiers: source.refundPolicyTiers,
			timings: source.timings,
			curatorEn: source.curatorEn,
			curatorFr: source.curatorFr,
			collaborators: source.collaborators,
			bookingClosesHoursBefore: source.bookingClosesHoursBefore,
			askDietaryRequirements: source.askDietaryRequirements,
			// Always a fresh Draft: never published, Spotlight or Portfolio,
			// no booking opening date, Recap, Visuals or Event Photos.
			visibility: 'draft',
			isSpotlight: false,
			isPortfolio: false,
		}).returning({ id: events.id });

		// Menus, each mapped to its copy for the new Services.
		const menus = await tx.select().from(eventMenus)
			.where(eq(eventMenus.eventId, sourceId))
			.orderBy(asc(eventMenus.createdAt));
		const menuIds = new Map<string, string>();
		for (const menu of menus) {
			const [created] = await tx.insert(eventMenus).values({
				eventId: copy.id,
				nameEn: menu.nameEn,
				nameFr: menu.nameFr,
				descriptionEn: menu.descriptionEn,
				descriptionFr: menu.descriptionFr,
			}).returning({ id: eventMenus.id });
			menuIds.set(menu.id, created.id);
		}

		const pattern = await loadPatternSource(tx, sourceId);
		const planned = planSchedulePattern(pattern, days, source.timeZone);

		if (days.length > 0) {
			const createdDays = await tx.insert(eventDays)
				.values(days.map((day) => ({ eventId: copy.id, date: day.date })))
				.returning({ id: eventDays.id, date: sql<string>`${eventDays.date}::text` });
			const dayIdByDate = new Map(createdDays.map((day: { id: string; date: string }) => [day.date, day.id]));

			for (const service of planned) {
				const [created] = await tx.insert(eventServices).values({
					dayId: dayIdByDate.get(service.date)!,
					kind: service.kind,
					defaultSeatingDurationMinutes: service.defaultSeatingDurationMinutes,
					menuId: service.menuId ? menuIds.get(service.menuId) ?? null : null,
					priceAmount: service.priceAmount,
				}).returning({ id: eventServices.id });

				if (service.seatings.length === 0) continue;
				await tx.insert(eventSessions).values(service.seatings.map((seating) => {
					const totalCapacity = seating.capacityOverride ?? source.venueCapacity!;
					return {
						eventId: copy.id,
						serviceId: created.id,
						titleEn: seating.titleEn,
						titleFr: seating.titleFr,
						descriptionEn: seating.descriptionEn,
						descriptionFr: seating.descriptionFr,
						startTime: seating.startTime,
						endTime: seating.endTime,
						totalCapacity,
						availableCapacity: totalCapacity,
						capacityOverridden: seating.capacityOverride !== null,
						published: seating.published,
						allowWaitlist: seating.allowWaitlist,
						badgeType: seating.badgeType,
					};
				}));
			}
			await recomputeEventDatesFromDays(tx, copy.id);
		}

		return copy.id;
	});
}

type SeatingRow = typeof eventSessions.$inferSelect;

/** The source's Services with their Day and Seatings. */
async function loadPatternSource(tx: typeof db, eventId: string): Promise<PatternSourceService<SeatingRow['badgeType']>[]> {
	const services: {
		id: string;
		date: string;
		kind: ServiceKind;
		defaultSeatingDurationMinutes: number;
		menuId: string | null;
		priceAmount: number | null;
	}[] = await tx.select({
		id: eventServices.id,
		date: sql<string>`${eventDays.date}::text`,
		kind: eventServices.kind,
		defaultSeatingDurationMinutes: eventServices.defaultSeatingDurationMinutes,
		menuId: eventServices.menuId,
		priceAmount: eventServices.priceAmount,
	})
		.from(eventServices)
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(eq(eventDays.eventId, eventId));
	if (services.length === 0) return [];

	const seatings: SeatingRow[] = await tx.select().from(eventSessions)
		.where(inArray(eventSessions.serviceId, services.map((service) => service.id)));
	return services.map((service) => ({
		...service,
		// A Seating keeping a legacy price is copied at its Service's price:
		// new Seatings never carry one.
		seatings: seatings.filter((seating) => seating.serviceId === service.id),
	}));
}

/** The meal kinds each Event serves, lunch first — what « Dupliquer »
 * pre-ticks on the Days picker. */
export async function getServedKindsByEventIds(eventIds: string[]): Promise<Record<string, ServiceKind[]>> {
	const served: Record<string, ServiceKind[]> = {};
	if (eventIds.length === 0) return served;
	const rows: { eventId: string; kind: ServiceKind }[] = await db.selectDistinct({
		eventId: eventDays.eventId,
		kind: eventServices.kind,
	})
		.from(eventServices)
		.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
		.where(inArray(eventDays.eventId, eventIds));
	for (const id of eventIds) {
		served[id] = servedKinds(rows.filter((row) => row.eventId === id));
	}
	return served;
}

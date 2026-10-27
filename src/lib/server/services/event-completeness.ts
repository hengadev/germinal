import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { eventDays, eventServices, eventSessions } from '../db/schema';
import {
	editorPortfolioWarnings,
	eventCompleteness,
	savedEventWarnings,
	type EditorPortfolioEvent,
	type EditorWarningsEvent,
	type EventCompleteness,
	type WarningSeating,
	type WarningService,
} from '$lib/utils/event-warnings';
import type { Visibility } from '$lib/utils/event-access';

/**
 * Draft completeness for the Events list (issue 013, ADR 0010): each
 * Draft's « À vérifier » warnings, computed with the editor's rules
 * (event-warnings.ts) and grouped by tab into the « n/5 » its row shows.
 * The whole list's Services and Seatings are read in two queries — never
 * one per Event.
 */

/** What the completeness reads off a listed Event: its row's texts, Booking
 * Window and Visuals, plus the Portfolio fields, with its media. */
export type CompletenessEvent = EditorWarningsEvent &
	EditorPortfolioEvent & {
		id: string;
		visibility: Visibility;
		isPortfolio: boolean;
	};

/** Each Draft's completeness, by Event id; published Events are left out. */
export async function draftCompleteness(
	events: readonly CompletenessEvent[]
): Promise<Record<string, EventCompleteness>> {
	const drafts = events.filter((event) => event.visibility === 'draft');
	if (drafts.length === 0) return {};

	const ids = drafts.map((event) => event.id);
	const [serviceRows, seatingRows] = await Promise.all([
		db
			.select({
				eventId: eventDays.eventId,
				serviceId: eventServices.id,
				date: sql<string>`${eventDays.date}::text`,
				kind: eventServices.kind,
				menuId: eventServices.menuId,
				priceAmount: eventServices.priceAmount,
			})
			.from(eventServices)
			.innerJoin(eventDays, eq(eventServices.dayId, eventDays.id))
			.where(inArray(eventDays.eventId, ids)),
		db
			.select({ eventId: eventSessions.eventId, startTime: eventSessions.startTime })
			.from(eventSessions)
			.where(inArray(eventSessions.eventId, ids)),
	]);

	const servicesOf = new Map<string, WarningService[]>();
	for (const row of serviceRows) {
		const services = servicesOf.get(row.eventId) ?? [];
		services.push({
			serviceId: row.serviceId,
			date: row.date,
			kind: row.kind,
			menuId: row.menuId,
			priceAmount: row.priceAmount,
		});
		servicesOf.set(row.eventId, services);
	}
	const seatingsOf = new Map<string, WarningSeating[]>();
	for (const row of seatingRows) {
		const seatings = seatingsOf.get(row.eventId) ?? [];
		seatings.push({ startTime: row.startTime });
		seatingsOf.set(row.eventId, seatings);
	}

	const completeness: Record<string, EventCompleteness> = {};
	for (const event of drafts) {
		// The Portfolio list joins the warnings only for a Portfolio Event,
		// as in the editor (a Draft rarely is one).
		const warnings = [
			...savedEventWarnings(event, servicesOf.get(event.id) ?? [], seatingsOf.get(event.id) ?? []),
			...(event.isPortfolio ? editorPortfolioWarnings(event) : []),
		];
		completeness[event.id] = eventCompleteness(warnings, { isPortfolio: event.isPortfolio });
	}
	return completeness;
}

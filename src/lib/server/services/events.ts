import { db } from '../db';
import { events, media, eventSessions, eventDays } from '../db/schema';
import { eq, desc, and, isNull, sql, or, ilike } from 'drizzle-orm';
import type { Event, CreateEventInput, UpdateEventInput } from '$lib/types/events';
import {
	parsePagination,
	calculatePagination,
	createPaginatedResponse,
	type PaginatedResponse,
} from '$lib/utils/pagination';
import { invalidateCacheTags, CACHE_TAGS } from '$lib/server/cache';
import { canBeSpotlight, canJoinPortfolio } from '$lib/utils/event-access';
import { withoutPracticalInfo, type WithoutPracticalInfo } from '$lib/utils/practical-info';
import { withProjectCover } from '$lib/utils/event-photos';
import type { EventWithMedia } from '$lib/types/events';
import { lastSeatingStartOf, listedEventsCondition, toAccessEvent } from './event-access';

/**
 * The Event columns every loader outside the admin reads: all but Internal
 * Notes (issue 039), which only Admins ever see. Listings, the Spotlight
 * and the public Event page go through this, so the notes never reach a
 * Guest or a Staff member.
 */
export const PUBLIC_EVENT_COLUMNS = { internalNotes: false } as const;

/**
 * Events, newest first, paged. `listedOnly` (the default) keeps the Events
 * Event access lets be listed publicly — the Portfolio, of any Visibility
 * except Draft (issues 030 and 044); the admin passes false. A listed page
 * is public: its Events leave without their Practical Info (issue 040),
 * and each is shown with its project cover — the Event Photos' cover,
 * falling back to the Visual one (issue 045).
 */
export async function getAllEvents(options: { listedOnly?: boolean; excludeSpotlight?: boolean; page?: number; limit?: number; cursor?: string; search?: string }) {
	const { listedOnly = true, excludeSpotlight = false, page = 1, limit = 20, search } = options;

	// Build where clause
	let whereClause = undefined;
	if (listedOnly) {
		whereClause = listedEventsCondition();
	}

	if (excludeSpotlight) {
		const spotlightClause = eq(events.isSpotlight, false);
		whereClause = whereClause ? and(whereClause, spotlightClause) : spotlightClause;
	}

	// Add search filter
	if (search && search.trim()) {
		const searchTerm = `%${search.trim()}%`;
		const searchCondition = or(
			ilike(events.titleEn, searchTerm),
			ilike(events.titleFr, searchTerm),
			ilike(events.descriptionEn, searchTerm),
			ilike(events.descriptionFr, searchTerm)
		);
		whereClause = whereClause ? and(whereClause, searchCondition) : searchCondition;
	}

	// Count total events for pagination
	const totalQuery = db.select({ count: sql<number>`count(*)::int` }).from(events).where(whereClause);
	const totalResult = await totalQuery;
	const total = totalResult[0]?.count ?? 0;

	// Fetch paginated events
	const paginatedEvents = await db.query.events.findMany({
		where: whereClause,
		orderBy: [desc(events.startDate)],
		limit,
		offset: (page - 1) * limit,
		columns: PUBLIC_EVENT_COLUMNS,
		with: {
			coverMedia: true,
			coverVideo: true,
			media: true,
		},
	});

	// Calculate pagination metadata
	const pagination = calculatePagination(page, limit, total);

	// Create response — a public listing never carries Practical Info, and
	// shows each project with its Event Photos' cover.
	const publicEvents = listedOnly
		? paginatedEvents.map((event: (typeof paginatedEvents)[number]) => withProjectCover(withoutPracticalInfo(event)))
		: paginatedEvents;
	return createPaginatedResponse(publicEvents, pagination);
}

/** Event ids are random UUIDs and public URLs carry them (ADR 0007). */
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One Event by id, without its Internal Notes (issue 039) unless the
 * caller is the admin editor and asks for them with `withInternalNotes`.
 */
export async function getEventById(id: string, options: { withInternalNotes?: boolean } = {}) {
  // Anything that is not a UUID cannot be an Event: not found, rather than
  // a database error on the cast.
  if (!EVENT_ID.test(id)) {
    throw new Error('Event not found');
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
    columns: options.withInternalNotes ? undefined : PUBLIC_EVENT_COLUMNS,
    with: {
      coverMedia: true,
      coverVideo: true,
      media: {
        orderBy: [desc(media.createdAt)],
      },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  return event;
}

/** The Spotlight as any public page sees it: its Event row with its
 * published Seatings, without its Practical Info (issue 040). */
export type SpotlightEvent = WithoutPracticalInfo<
	EventWithMedia & { eventSessions: (typeof eventSessions.$inferSelect)[] }
>;

/** The Spotlight, or null when there is none or Event access does not let
 * it be the Spotlight (issue 030). */
export async function getSpotlightEvent(): Promise<SpotlightEvent | null> {
  const spotlightEvent = await db.query.events.findFirst({
    where: eq(events.isSpotlight, true),
    columns: PUBLIC_EVENT_COLUMNS,
    with: {
      coverMedia: true,
      coverVideo: true,
      media: {
        orderBy: [desc(media.createdAt)],
      },
      eventSessions: {
        where: eq(eventSessions.published, true),
        orderBy: [eventSessions.startTime],
      },
    },
  });

  // Returns null if no spotlight event exists (valid state)
  // The Spotlight is public: it leaves without its Practical Info (issue 040).
  if (!spotlightEvent || !canBeSpotlight(toAccessEvent(spotlightEvent))) return null;
  return withoutPracticalInfo(spotlightEvent);
}

/**
 * Refused: making an Event that is not Public the Spotlight (issue 032,
 * ADR 0007). A Draft or Private Event can never be the Spotlight.
 */
export class SpotlightRequiresPublicError extends Error {
  constructor() {
    super('Only a Public Event can be the Spotlight');
    this.name = 'SpotlightRequiresPublicError';
  }
}

/**
 * Refused: adding an Event to the Portfolio before its last Seating has
 * started (issue 044, ADR 0007). A Private Event's link must never be
 * listed while its Event can still be booked, so an Event joins the
 * Portfolio only once it is over.
 */
export class PortfolioRequiresOverEventError extends Error {
  constructor() {
    super('Only an Event whose last Seating has started can join the Portfolio');
    this.name = 'PortfolioRequiresOverEventError';
  }
}

export async function createEvent(input: CreateEventInput) {
  const visibility = input.visibility ?? 'draft';
  if (input.isSpotlight && !canBeSpotlight({ visibility })) {
    throw new SpotlightRequiresPublicError();
  }
  // A new Event has no Seating yet, so its last one can never have started:
  // it cannot join the Portfolio at creation (issue 044).
  if (input.isPortfolio) {
    throw new PortfolioRequiresOverEventError();
  }

  return await db.transaction(async (tx: typeof db) => {
    // If new event is spotlight, unset any existing spotlight first
    if (input.isSpotlight) {
      await tx.update(events)
        .set({ isSpotlight: false, updatedAt: new Date() })
        .where(eq(events.isSpotlight, true));
    }

    const [event] = await tx.insert(events).values({
      titleEn: input.titleEn,
      titleFr: input.titleFr,
      descriptionEn: input.descriptionEn,
      descriptionFr: input.descriptionFr,
      subtitleEn: input.subtitleEn,
      subtitleFr: input.subtitleFr,
      startDate: input.startDate,
      endDate: input.endDate,
      locationEn: input.locationEn,
      locationFr: input.locationFr,
      venueNameEn: input.venueNameEn,
      venueNameFr: input.venueNameFr,
      streetAddressEn: input.streetAddressEn,
      streetAddressFr: input.streetAddressFr,
      districtEn: input.districtEn,
      districtFr: input.districtFr,
      cityEn: input.cityEn,
      cityFr: input.cityFr,
      postalCode: input.postalCode,
      countryEn: input.countryEn,
      countryFr: input.countryFr,
      // Time Zone of the venue (ADR 0006); the column defaults to Europe/Paris.
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
      collaborators: input.collaborators,
      timings: input.timings,
      curatorEn: input.curatorEn,
      curatorFr: input.curatorFr,
      admissionInfoEn: input.admissionInfoEn,
      admissionInfoFr: input.admissionInfoFr,
      internalNotes: input.internalNotes,
      // Practical Info (issue 040): Ticket-holders only, never public.
      practicalInfoEn: input.practicalInfoEn,
      practicalInfoFr: input.practicalInfoFr,
      venueCapacity: input.venueCapacity ?? null,
      coverMediaId: input.coverMediaId,
      visibility,
      isSpotlight: input.isSpotlight ?? false,
    }).returning();

    invalidateCacheTags([CACHE_TAGS.EVENTS]);
    return event;
  });
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  return await db.transaction(async (tx: typeof db) => {
    // Only a Public Event can be the Spotlight (issue 032): making any other
    // the Spotlight is refused, and moving the Spotlight to Draft or Private
    // clears it. The Portfolio (issue 044) is joined only once the Event's
    // last Seating has started; the server refuses it earlier.
    let spotlight = input.isSpotlight;
    if (input.isSpotlight === true || input.visibility !== undefined || input.isPortfolio === true) {
      const [current] = await tx.select({ visibility: events.visibility })
        .from(events)
        .where(eq(events.id, id))
        .limit(1);
      if (!current) {
        throw new Error('Event not found');
      }
      const visibility = input.visibility ?? current.visibility;
      if (!canBeSpotlight({ visibility })) {
        if (input.isSpotlight === true) throw new SpotlightRequiresPublicError();
        spotlight = false;
      }
      if (input.isPortfolio === true) {
        const event = toAccessEvent({
          visibility,
          isPortfolio: true,
          lastSeatingStart: await lastSeatingStartOf(tx, id),
        });
        if (!canJoinPortfolio(event, new Date())) throw new PortfolioRequiresOverEventError();
      }
    }

    // If event is being set to spotlight, unset others
    if (spotlight === true) {
      await tx.update(events)
        .set({ isSpotlight: false, updatedAt: new Date() })
        .where(and(
          eq(events.isSpotlight, true),
          sql`id != ${id}`
        ));
    }

    // Once an Event has Days, startDate/endDate are derived from them
    // (ADR 0005) and recomputed whenever its Seatings change — a hand-edited
    // value is ignored so it can never diverge from the schedule. An Event
    // with no Days yet keeps its hand-entered window.
    const [day] = await tx.select({ id: eventDays.id })
      .from(eventDays)
      .where(eq(eventDays.eventId, id))
      .limit(1);
    const withSpotlight = spotlight === undefined ? input : { ...input, isSpotlight: spotlight };
    // The Time Zone only changes through changeEventTimeZone, which moves
    // the Seatings' instants with it (ADR 0006).
    const { timeZone: _timeZone, ...fields } = withSpotlight;
    const { startDate: _startDate, endDate: _endDate, ...rest } = fields;
    const writable = day ? rest : fields;

    const [updated] = await tx.update(events)
      .set({
        ...writable,
        updatedAt: new Date()
      })
      .where(eq(events.id, id))
      .returning();

    if (!updated) {
      throw new Error('Event not found');
    }

    invalidateCacheTags([CACHE_TAGS.EVENTS]);
    return updated;
  });
}

export async function deleteEvent(id: string) {
  await db.delete(events).where(eq(events.id, id));
}

export async function setEventCoverMedia(eventId: string, mediaId: string) {
  await db.update(media)
    .set({ isCover: false })
    .where(and(
      eq(media.eventId, eventId),
      eq(media.isCover, true)
    ));

  const [updated] = await db.update(events)
    .set({ coverMediaId: mediaId, updatedAt: new Date() })
    .where(eq(events.id, eventId))
    .returning();

  if (!updated) {
    throw new Error('Event not found');
  }

  return updated;
}

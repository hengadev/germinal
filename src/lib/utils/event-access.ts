import { bookingWindowState, DEFAULT_BOOKING_WINDOW, type BookingWindow } from './booking-window';

/**
 * Event access (issue 030, ADR 0007) — pure, no database.
 *
 * The one place that decides, for every public entry point (the Event page,
 * the booking page, the reservation API, Waitlist join and notifications,
 * the `.ics` endpoint, the Events listing, the Spotlight, the homepage
 * gallery and the sitemap), whether a viewer may see an Event, whether it
 * may be listed, indexed or made the Spotlight, and whether one of its
 * Seatings can be booked or wait-listed — and if not, why. No entry point
 * checks publication on its own.
 *
 * Inputs are plain snapshots so later rules slot in by widening them:
 * Visibility (032) replaced `published`, the Admin preview (033) adds a
 * view for the Admin viewer, the Booking Window (035) adds refusals before
 * opening and after closing, and the Portfolio (044) adds a listing rule
 * and decides when an Event may join it.
 */

/** Who is looking: anyone, or a signed-in Admin. */
export type Viewer = { role: 'anonymous' } | { role: 'admin' };

export const ANONYMOUS: Viewer = { role: 'anonymous' };
export const ADMIN: Viewer = { role: 'admin' };

/** The viewer behind a request's signed-in user (if any). */
export function viewerOf(user: { role: string } | null | undefined): Viewer {
	return user?.role === 'admin' ? ADMIN : ANONYMOUS;
}

/**
 * Who can see and book an Event (ADR 0007). `draft`: Admins only. `private`:
 * anyone holding its id link, but never listed, indexed or the Spotlight.
 * `public`: anyone, and it may be the Spotlight.
 */
export type Visibility = 'draft' | 'private' | 'public';

export const VISIBILITIES: readonly Visibility[] = ['draft', 'private', 'public'];

/** What Event access needs to know about an Event. The Portfolio fields
 * (issue 044) may be unknown to a caller that does not need them: an
 * absent flag means "not in the Portfolio", an absent last Seating start
 * means "may not join it yet" — both fail closed. */
export interface AccessEvent {
	visibility: Visibility;
	/** Its Booking Window (035); absent: the default one (open as soon as
	 * published, closing at each Seating's start). */
	bookingWindow?: BookingWindow;
	/** Whether the Event is part of the Portfolio (ADR 0007), the
	 * post-event showcase "Projets" and the homepage gallery list. */
	isPortfolio?: boolean;
	/** When the Event's last Seating starts; null when it has none. */
	lastSeatingStart?: Date | null;
}

/** What Event access needs to know about a Seating. */
export interface AccessSeating {
	published: boolean;
	/** Whether the Seating has a price to be booked at (its Service's, or a
	 * legacy one): a Seating whose Service has no price is not yet bookable. */
	priced: boolean;
	startTime: Date;
	/** Null on a Seating without a limit (ADR 0009): never full. */
	availableCapacity: number | null;
	allowWaitlist: boolean;
}

/** Which page an Event is shown as: its announcement; its Portfolio
 * project once it is in the Portfolio (issue 045: Recap, Event Photos,
 * credits, dates and venue, without the announcement text, Seatings,
 * prices or booking); or — for an Admin looking at a Draft (issue 033) —
 * the preview of its announcement. */
export type EventView = 'announcement' | 'portfolio' | 'preview';

export type EventAccessDecision = { visible: true; view: EventView } | { visible: false };

/** May this viewer see the Event's page, and as what. Hidden means "not found". */
export function eventAccess(event: AccessEvent, viewer: Viewer): EventAccessDecision {
	if (event.visibility === 'draft') {
		// The Admin preview (issue 033): an Admin sees a Draft's real page,
		// as a Guest would, with booking disabled; everyone else gets
		// "not found".
		if (viewer.role === 'admin') return { visible: true, view: 'preview' };
		return { visible: false };
	}
	// A Portfolio Event is shown as a project (ADR 0007, issue 045).
	if (event.isPortfolio === true) return { visible: true, view: 'portfolio' };
	return { visible: true, view: 'announcement' };
}

/** May the Event appear in public listings (the Events listing, homepage
 * gallery): Portfolio Events of any Visibility except Draft, most recent
 * first (issue 044). A Private Event joins the Portfolio only once it is
 * over, so listing it no longer exposes a bookable link; an Event that is
 * over and not in the Portfolio is listed nowhere. */
export function isListed(event: AccessEvent): boolean {
	return event.isPortfolio === true && event.visibility !== 'draft';
}

/** May the Event's page be indexed (sitemap, no `noindex`): Public only —
 * even a Portfolio one, a Private Event stays out of the sitemap. */
export function isIndexed(event: AccessEvent): boolean {
	return event.visibility === 'public';
}

/** May the Event be shown as the Spotlight: Public only. */
export function canBeSpotlight(event: AccessEvent): boolean {
	return event.visibility === 'public';
}

/** May the Event join the Portfolio: only once its last Seating has
 * started (ADR 0007) — the one hard rule, so a Private Event's link is
 * never listed while its Event can still be booked. An Event without
 * Seatings never can. */
export function canJoinPortfolio(event: AccessEvent, now: Date): boolean {
	const lastSeatingStart = event.lastSeatingStart ?? null;
	return lastSeatingStart !== null && lastSeatingStart.getTime() <= now.getTime();
}

/** Why a Seating cannot be booked, in the order the rules are checked. */
export type BookingRefusal =
	| 'event-not-published'
	| 'seating-unpublished'
	| 'not-priced'
	| 'started'
	| 'not-open'
	| 'closed'
	| 'full';

export type SeatingBookingDecision =
	| { bookable: true }
	| { bookable: false; reason: Exclude<BookingRefusal, 'not-open'> }
	/** Before the Booking Window opens (035): when it opens. */
	| { bookable: false; reason: 'not-open'; opensAt: Date };

export interface SeatingAccessInput {
	event: AccessEvent;
	seating: AccessSeating;
	viewer: Viewer;
	now: Date;
}

type Refusal = { reason: Exclude<BookingRefusal, 'full' | 'not-open'> } | { reason: 'not-open'; opensAt: Date };

/** Refusals shared by booking and the Waitlist, before capacity. */
function refusalBeforeCapacity({ event, seating, viewer, now }: SeatingAccessInput): Refusal | null {
	const access = eventAccess(event, viewer);
	// The Admin preview (033) may show a Draft's page, but no viewer ever
	// books one: the preview view refuses like a hidden Event does.
	if (!access.visible || access.view === 'preview') return { reason: 'event-not-published' };
	if (!seating.published) return { reason: 'seating-unpublished' };
	if (!seating.priced) return { reason: 'not-priced' };
	if (seating.startTime.getTime() <= now.getTime()) return { reason: 'started' };
	// The Booking Window (035): before it opens, or once it has closed
	// for this Seating, it can neither be booked nor wait-listed.
	const window = bookingWindowState(event.bookingWindow ?? DEFAULT_BOOKING_WINDOW, seating.startTime, now);
	if (window.state === 'not-open') return { reason: 'not-open', opensAt: window.opensAt };
	if (window.state === 'closed') return { reason: 'closed' };
	return null;
}

/**
 * Can this viewer book `seats` seats (default 1) on the Seating now, and if
 * not, why. The first matching refusal wins.
 */
export function seatingBooking(input: SeatingAccessInput & { seats?: number }): SeatingBookingDecision {
	const refusal = refusalBeforeCapacity(input);
	if (refusal) return { bookable: false, ...refusal };
	const available = input.seating.availableCapacity;
	if (available !== null && available < (input.seats ?? 1)) return { bookable: false, reason: 'full' };
	return { bookable: true };
}

export type WaitlistRefusal = Exclude<BookingRefusal, 'full'> | 'waitlist-not-offered';

export type WaitlistDecision = { allowed: true } | { allowed: false; reason: WaitlistRefusal };

/**
 * Can this viewer join (or be notified from) the Seating's Waitlist now: a
 * Seating that could be booked but for being full, and that offers one.
 */
export function waitlistAccess(input: SeatingAccessInput): WaitlistDecision {
	const refusal = refusalBeforeCapacity(input);
	if (refusal) return { allowed: false, reason: refusal.reason };
	if (!input.seating.allowWaitlist) return { allowed: false, reason: 'waitlist-not-offered' };
	return { allowed: true };
}

/** How a public page shows a Seating: why it cannot be booked (null when it
 * can) and whether its Waitlist is open. */
export interface SeatingAvailability {
	bookingRefusal: BookingRefusal | null;
	/** When booking opens, while the Booking Window has not (035); null
	 * otherwise. */
	bookingOpensAt: Date | null;
	waitlistOpen: boolean;
}

export function seatingAvailability(input: SeatingAccessInput): SeatingAvailability {
	const booking = seatingBooking(input);
	return {
		bookingRefusal: booking.bookable ? null : booking.reason,
		bookingOpensAt: !booking.bookable && booking.reason === 'not-open' ? booking.opensAt : null,
		waitlistOpen: !booking.bookable && booking.reason === 'full' && waitlistAccess(input).allowed,
	};
}

/** A Visibility from untrusted input (a form field), or null. */
export function parseVisibility(value: unknown): Visibility | null {
	return typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value)
		? (value as Visibility)
		: null;
}

/** The Admin's French name for each Visibility. */
export const VISIBILITY_LABELS: Record<Visibility, string> = {
	draft: 'Brouillon',
	private: 'Privé',
	public: 'Public',
};

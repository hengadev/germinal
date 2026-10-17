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
 * Visibility (032) replaces `published`, the Booking Window (035) adds
 * refusals before opening and after closing, and the Portfolio (044) adds a
 * view and a listing rule.
 */

/** Who is looking: anyone, or a signed-in Admin. */
export type Viewer = { role: 'anonymous' } | { role: 'admin' };

export const ANONYMOUS: Viewer = { role: 'anonymous' };
export const ADMIN: Viewer = { role: 'admin' };

/** The viewer behind a request's signed-in user (if any). */
export function viewerOf(user: { role: string } | null | undefined): Viewer {
	return user?.role === 'admin' ? ADMIN : ANONYMOUS;
}

/** What Event access needs to know about an Event. */
export interface AccessEvent {
	published: boolean;
}

/** What Event access needs to know about a Seating. */
export interface AccessSeating {
	published: boolean;
	/** Whether the Seating has a price to be booked at (its Service's, or a
	 * legacy one): a Seating whose Service has no price is not yet bookable. */
	priced: boolean;
	startTime: Date;
	availableCapacity: number;
	allowWaitlist: boolean;
}

/** Which page an Event is shown as: its announcement, or — for an
 * Admin looking at a Draft (issue 033) — the preview of it. */
export type EventView = 'announcement' | 'preview';

export type EventAccessDecision = { visible: true; view: EventView } | { visible: false };

/** May this viewer see the Event's page, and as what. Hidden means "not found". */
export function eventAccess(event: AccessEvent, viewer: Viewer): EventAccessDecision {
	if (!event.published) {
		// The Admin preview (issue 033): an Admin sees a Draft's real page,
		// as a Guest would, with booking disabled; everyone else gets
		// "not found".
		if (viewer.role === 'admin') return { visible: true, view: 'preview' };
		return { visible: false };
	}
	return { visible: true, view: 'announcement' };
}

/** May the Event appear in public listings (Events listing, homepage gallery). */
export function isListed(event: AccessEvent): boolean {
	return event.published;
}

/** May the Event's page be indexed (sitemap). */
export function isIndexed(event: AccessEvent): boolean {
	return event.published;
}

/** May the Event be shown as the Spotlight. */
export function canBeSpotlight(event: AccessEvent): boolean {
	return event.published;
}

/** Why a Seating cannot be booked, in the order the rules are checked. */
export type BookingRefusal =
	| 'event-not-published'
	| 'seating-unpublished'
	| 'not-priced'
	| 'started'
	| 'full';

export type SeatingBookingDecision = { bookable: true } | { bookable: false; reason: BookingRefusal };

export interface SeatingAccessInput {
	event: AccessEvent;
	seating: AccessSeating;
	viewer: Viewer;
	now: Date;
}

/** Refusals shared by booking and the Waitlist, before capacity. */
function refusalBeforeCapacity({ event, seating, viewer, now }: SeatingAccessInput): BookingRefusal | null {
	const access = eventAccess(event, viewer);
	// The Admin preview (033) may show a Draft's page, but no viewer ever
	// books one: the preview view refuses like a hidden Event does.
	if (!access.visible || access.view === 'preview') return 'event-not-published';
	if (!seating.published) return 'seating-unpublished';
	if (!seating.priced) return 'not-priced';
	if (seating.startTime.getTime() <= now.getTime()) return 'started';
	return null;
}

/**
 * Can this viewer book `seats` seats (default 1) on the Seating now, and if
 * not, why. The first matching refusal wins.
 */
export function seatingBooking(input: SeatingAccessInput & { seats?: number }): SeatingBookingDecision {
	const refusal = refusalBeforeCapacity(input);
	if (refusal) return { bookable: false, reason: refusal };
	if (input.seating.availableCapacity < (input.seats ?? 1)) return { bookable: false, reason: 'full' };
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
	if (refusal) return { allowed: false, reason: refusal as WaitlistRefusal };
	if (!input.seating.allowWaitlist) return { allowed: false, reason: 'waitlist-not-offered' };
	return { allowed: true };
}

/** How a public page shows a Seating: why it cannot be booked (null when it
 * can) and whether its Waitlist is open. */
export interface SeatingAvailability {
	bookingRefusal: BookingRefusal | null;
	waitlistOpen: boolean;
}

export function seatingAvailability(input: SeatingAccessInput): SeatingAvailability {
	const booking = seatingBooking(input);
	return {
		bookingRefusal: booking.bookable ? null : booking.reason,
		waitlistOpen: !booking.bookable && booking.reason === 'full' && waitlistAccess(input).allowed,
	};
}

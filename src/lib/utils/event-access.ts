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
 * opening and after closing, and the Portfolio (044) adds a view and a
 * listing rule.
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

/** What Event access needs to know about an Event. */
export interface AccessEvent {
	visibility: Visibility;
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

/** Which page an Event is shown as. */
export type EventView = 'announcement';

export type EventAccessDecision = { visible: true; view: EventView } | { visible: false };

/** May this viewer see the Event's page, and as what. Hidden means "not found". */
export function eventAccess(event: AccessEvent, _viewer: Viewer): EventAccessDecision {
	if (event.visibility === 'draft') return { visible: false };
	return { visible: true, view: 'announcement' };
}

/** May the Event appear in public listings (Events listing, homepage
 * gallery): Public Events only — a Private one is reached by its link. */
export function isListed(event: AccessEvent): boolean {
	return event.visibility === 'public';
}

/** May the Event's page be indexed (sitemap, no `noindex`): Public only. */
export function isIndexed(event: AccessEvent): boolean {
	return event.visibility === 'public';
}

/** May the Event be shown as the Spotlight: Public only. */
export function canBeSpotlight(event: AccessEvent): boolean {
	return event.visibility === 'public';
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
	if (!eventAccess(event, viewer).visible) return 'event-not-published';
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

import { describe, it, expect } from 'vitest';
import {
	ANONYMOUS,
	ADMIN,
	viewerOf,
	eventAccess,
	isListed,
	isIndexed,
	canBeSpotlight,
	parseVisibility,
	VISIBILITIES,
	seatingBooking,
	waitlistAccess,
	seatingAvailability,
	type EventAccessDecision,
	type AccessEvent,
	type AccessSeating,
	type Viewer,
	type Visibility,
} from '../../../src/lib/utils/event-access';

const NOW = new Date('2099-06-01T12:00:00Z');
const LATER = new Date('2099-06-01T19:00:00Z');
const EARLIER = new Date('2099-06-01T11:00:00Z');

const DRAFT: AccessEvent = { visibility: 'draft' };
const PRIVATE: AccessEvent = { visibility: 'private' };
const PUBLIC: AccessEvent = { visibility: 'public' };
const EVENTS: [Visibility, AccessEvent][] = [
	['draft', DRAFT],
	['private', PRIVATE],
	['public', PUBLIC],
];

function seating(overrides: Partial<AccessSeating> = {}): AccessSeating {
	return {
		published: true,
		priced: true,
		startTime: LATER,
		availableCapacity: 10,
		allowWaitlist: true,
		...overrides,
	};
}

const VIEWERS: [string, Viewer][] = [
	['anonymous', ANONYMOUS],
	['Admin', ADMIN],
];

describe('viewerOf', () => {
	it('is the Admin for a signed-in admin', () => {
		expect(viewerOf({ role: 'admin' })).toEqual(ADMIN);
	});

	it.each([[null], [undefined], [{ role: 'staff' }], [{ role: 'guest' }]])(
		'is anonymous otherwise (%o)',
		(user) => {
			expect(viewerOf(user)).toEqual(ANONYMOUS);
		}
	);
});

describe('eventAccess', () => {
	// Every Visibility × viewer combination. A Draft is not found for
	// everyone but an Admin, who sees it as a preview (033).
	const cases: [Visibility, string, Viewer, EventAccessDecision][] = [];
	for (const [visibility] of EVENTS) {
		for (const [viewerName, viewer] of VIEWERS) {
			cases.push([
				visibility,
				viewerName,
				viewer,
				visibility !== 'draft'
					? { visible: true, view: 'announcement' }
					: viewer.role === 'admin'
						? { visible: true, view: 'preview' }
						: { visible: false },
			]);
		}
	}

	it.each(cases)('a %s Event, %s viewer', (visibility, _, viewer, expected) => {
		expect(eventAccess({ visibility }, viewer)).toEqual(expected);
	});
});

describe('listing, indexing and the Spotlight', () => {
	it.each([
		['draft', DRAFT, false],
		['private', PRIVATE, false],
		['public', PUBLIC, true],
	] as const)('a %s Event — listed, indexed and Spotlight-able: %s', (_, event, expected) => {
		expect(isListed(event)).toBe(expected);
		expect(isIndexed(event)).toBe(expected);
		expect(canBeSpotlight(event)).toBe(expected);
	});
});

describe('parseVisibility', () => {
	it.each(VISIBILITIES.map((v) => [v]))('accepts %s', (value) => {
		expect(parseVisibility(value)).toBe(value);
	});

	it.each([[null], [undefined], [''], ['published'], ['PUBLIC'], [true]])('rejects %o', (value) => {
		expect(parseVisibility(value)).toBeNull();
	});
});

describe('seatingBooking', () => {
	// Every Visibility × viewer × Seating-state combination. The first
	// matching refusal wins, in this order: Event not published, Seating
	// unpublished, no price on its Service, Seating started, full. The Admin
	// preview (033) shows a Draft's page but never books it: a Draft's
	// Seatings refuse for the Admin too.
	const SEATING_STATES: [string, AccessSeating, string | null][] = [
		['open', seating(), null],
		['unpublished', seating({ published: false }), 'seating-unpublished'],
		['unpriced', seating({ priced: false }), 'not-priced'],
		['started', seating({ startTime: EARLIER }), 'started'],
		['starting now', seating({ startTime: NOW }), 'started'],
		['full', seating({ availableCapacity: 0 }), 'full'],
		['unpublished and unpriced', seating({ published: false, priced: false }), 'seating-unpublished'],
		['unpriced and started', seating({ priced: false, startTime: EARLIER }), 'not-priced'],
		['started and full', seating({ startTime: EARLIER, availableCapacity: 0 }), 'started'],
	];

	const cases: [string, AccessEvent, string, Viewer, string, AccessSeating, string | null][] = [];
	for (const [eventName, event] of EVENTS) {
		for (const [viewerName, viewer] of VIEWERS) {
			for (const [stateName, state, reason] of SEATING_STATES) {
				cases.push([
					eventName,
					event,
					viewerName,
					viewer,
					stateName,
					state,
					event.visibility === 'draft' ? 'event-not-published' : reason,
				]);
			}
		}
	}

	it.each(cases)(
		'%s Event, %s viewer, %s Seating → %s',
		(_e, event, _v, viewer, _s, state, reason) => {
			const result = seatingBooking({ event, seating: state, viewer, now: NOW });
			expect(result).toEqual(reason === null ? { bookable: true } : { bookable: false, reason });
		}
	);

	it('is full when fewer seats are left than asked for', () => {
		const state = seating({ availableCapacity: 2 });
		expect(seatingBooking({ event: PUBLIC, seating: state, viewer: ANONYMOUS, now: NOW, seats: 2 }))
			.toEqual({ bookable: true });
		expect(seatingBooking({ event: PUBLIC, seating: state, viewer: ANONYMOUS, now: NOW, seats: 3 }))
			.toEqual({ bookable: false, reason: 'full' });
	});
});

describe('waitlistAccess', () => {
	it.each(VIEWERS)('a full Seating of a Public or Private Event can be wait-listed (%s viewer)', (_, viewer) => {
		for (const event of [PUBLIC, PRIVATE]) {
			expect(waitlistAccess({ event, seating: seating({ availableCapacity: 0 }), viewer, now: NOW }))
				.toEqual({ allowed: true });
		}
	});

	it('being full is not a reason to refuse it', () => {
		expect(waitlistAccess({ event: PUBLIC, seating: seating(), viewer: ANONYMOUS, now: NOW }))
			.toEqual({ allowed: true });
	});

	it.each([
		['a Draft', DRAFT, seating({ availableCapacity: 0 }), 'event-not-published'],
		['an unpublished Seating', PUBLIC, seating({ published: false }), 'seating-unpublished'],
		['an unpriced Seating', PUBLIC, seating({ priced: false }), 'not-priced'],
		['a started Seating', PUBLIC, seating({ startTime: EARLIER }), 'started'],
		['a Seating without a Waitlist', PUBLIC, seating({ allowWaitlist: false }), 'waitlist-not-offered'],
	])('refuses %s', (_, event, state, reason) => {
		for (const [, viewer] of VIEWERS) {
			expect(waitlistAccess({ event, seating: state, viewer, now: NOW })).toEqual({ allowed: false, reason });
		}
	});
});

describe('seatingAvailability', () => {
	it.each([
		['an open Seating', PUBLIC, seating(), { bookingRefusal: null, bookingOpensAt: null, waitlistOpen: false }],
		['a full Seating with a Waitlist', PUBLIC, seating({ availableCapacity: 0 }), { bookingRefusal: 'full', bookingOpensAt: null, waitlistOpen: true }],
		['a full Seating without one', PUBLIC, seating({ availableCapacity: 0, allowWaitlist: false }), { bookingRefusal: 'full', bookingOpensAt: null, waitlistOpen: false }],
		['a full, unpriced Seating', PUBLIC, seating({ availableCapacity: 0, priced: false }), { bookingRefusal: 'not-priced', bookingOpensAt: null, waitlistOpen: false }],
		['a Seating of a Draft', DRAFT, seating({ availableCapacity: 0 }), { bookingRefusal: 'event-not-published', bookingOpensAt: null, waitlistOpen: false }],
	])('%s', (_, event, state, expected) => {
		expect(seatingAvailability({ event, seating: state, viewer: ANONYMOUS, now: NOW })).toEqual(expected);
	});

	// In the Admin preview (033) every Seating is shown unbookable and no
	// Waitlist opens, so the page can leave the booking links out.
	it.each(VIEWERS)('in the preview of a Draft, every Seating is unbookable and no Waitlist opens (%s viewer)', (_, viewer) => {
		expect(seatingAvailability({ event: DRAFT, seating: seating({ availableCapacity: 0 }), viewer, now: NOW }))
			.toEqual({ bookingRefusal: 'event-not-published', bookingOpensAt: null, waitlistOpen: false });
	});
});

describe('the Booking Window (035)', () => {
	const OPENS = new Date('2099-06-01T15:00:00Z');
	const notYetOpen: AccessEvent = { visibility: 'public', bookingWindow: { opensAt: OPENS, closesHoursBefore: null } };
	const opened: AccessEvent = { visibility: 'public', bookingWindow: { opensAt: EARLIER, closesHoursBefore: null } };
	// LATER is 7 hours after NOW: closing 7 hours before it closes it now.
	const closingNow: AccessEvent = { visibility: 'public', bookingWindow: { opensAt: null, closesHoursBefore: 7 } };
	const closingLater: AccessEvent = { visibility: 'public', bookingWindow: { opensAt: null, closesHoursBefore: 6 } };
	const unset: AccessEvent = { visibility: 'public', bookingWindow: { opensAt: null, closesHoursBefore: null } };

	it.each([
		['before it opens', notYetOpen, { bookable: false, reason: 'not-open', opensAt: OPENS }],
		['once it has opened', opened, { bookable: true }],
		['at its closing instant', closingNow, { bookable: false, reason: 'closed' }],
		['before its closing instant', closingLater, { bookable: true }],
		['with neither setting', unset, { bookable: true }],
	] as const)('booking %s', (_, event, expected) => {
		for (const [, viewer] of VIEWERS) {
			expect(seatingBooking({ event, seating: seating(), viewer, now: NOW })).toEqual(expected);
		}
	});

	it('a started Seating is "started", not "closed"', () => {
		expect(seatingBooking({ event: closingNow, seating: seating({ startTime: EARLIER }), viewer: ANONYMOUS, now: NOW }))
			.toEqual({ bookable: false, reason: 'started' });
	});

	it('a full Seating outside the window refuses for the window, not for being full', () => {
		expect(seatingBooking({ event: notYetOpen, seating: seating({ availableCapacity: 0 }), viewer: ANONYMOUS, now: NOW }))
			.toEqual({ bookable: false, reason: 'not-open', opensAt: OPENS });
		expect(seatingBooking({ event: closingNow, seating: seating({ availableCapacity: 0 }), viewer: ANONYMOUS, now: NOW }))
			.toEqual({ bookable: false, reason: 'closed' });
	});

	it('an unpriced Seating stays "not-priced" before opening', () => {
		expect(seatingBooking({ event: notYetOpen, seating: seating({ priced: false }), viewer: ANONYMOUS, now: NOW }))
			.toEqual({ bookable: false, reason: 'not-priced' });
	});

	it('a Draft stays unpublished whatever its window', () => {
		const draft: AccessEvent = { visibility: 'draft', bookingWindow: { opensAt: EARLIER, closesHoursBefore: null } };
		expect(seatingBooking({ event: draft, seating: seating(), viewer: ADMIN, now: NOW }))
			.toEqual({ bookable: false, reason: 'event-not-published' });
	});

	it.each([
		['before it opens', notYetOpen, { allowed: false, reason: 'not-open' }],
		['after it closes', closingNow, { allowed: false, reason: 'closed' }],
		['inside it', closingLater, { allowed: true }],
	] as const)('the Waitlist %s', (_, event, expected) => {
		expect(waitlistAccess({ event, seating: seating({ availableCapacity: 0 }), viewer: ANONYMOUS, now: NOW })).toEqual(expected);
	});

	it.each([
		['before opening: when it opens, no Waitlist', notYetOpen, { bookingRefusal: 'not-open', bookingOpensAt: OPENS, waitlistOpen: false }],
		['after closing: closed, no Waitlist', closingNow, { bookingRefusal: 'closed', bookingOpensAt: null, waitlistOpen: false }],
		['inside it: full, Waitlist open', closingLater, { bookingRefusal: 'full', bookingOpensAt: null, waitlistOpen: true }],
	] as const)('a full Seating shown %s', (_, event, expected) => {
		expect(seatingAvailability({ event, seating: seating({ availableCapacity: 0 }), viewer: ANONYMOUS, now: NOW })).toEqual(expected);
	});
});

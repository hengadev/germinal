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
	// Every Visibility × viewer combination.
	const cases: [Visibility, string, Viewer, boolean][] = [];
	for (const [visibility] of EVENTS) {
		for (const [viewerName, viewer] of VIEWERS) {
			// The Admin preview of a Draft comes in a later issue (033):
			// until then a Draft is not found for everyone.
			cases.push([visibility, viewerName, viewer, visibility !== 'draft']);
		}
	}

	it.each(cases)('a %s Event, %s viewer → visible: %s', (visibility, _, viewer, visible) => {
		expect(eventAccess({ visibility }, viewer)).toEqual(
			visible ? { visible: true, view: 'announcement' } : { visible: false }
		);
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
	// unpublished, no price on its Service, Seating started, full.
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
		['an open Seating', PUBLIC, seating(), { bookingRefusal: null, waitlistOpen: false }],
		['a full Seating with a Waitlist', PUBLIC, seating({ availableCapacity: 0 }), { bookingRefusal: 'full', waitlistOpen: true }],
		['a full Seating without one', PUBLIC, seating({ availableCapacity: 0, allowWaitlist: false }), { bookingRefusal: 'full', waitlistOpen: false }],
		['a full, unpriced Seating', PUBLIC, seating({ availableCapacity: 0, priced: false }), { bookingRefusal: 'not-priced', waitlistOpen: false }],
		['a Seating of a Draft', DRAFT, seating({ availableCapacity: 0 }), { bookingRefusal: 'event-not-published', waitlistOpen: false }],
	])('%s', (_, event, state, expected) => {
		expect(seatingAvailability({ event, seating: state, viewer: ANONYMOUS, now: NOW })).toEqual(expected);
	});
});

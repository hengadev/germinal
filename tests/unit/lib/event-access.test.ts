import { describe, it, expect } from 'vitest';
import {
	ANONYMOUS,
	ADMIN,
	viewerOf,
	eventAccess,
	isListed,
	isIndexed,
	canBeSpotlight,
	seatingBooking,
	waitlistAccess,
	type AccessEvent,
	type AccessSeating,
	type Viewer,
} from '../../../src/lib/utils/event-access';

const NOW = new Date('2099-06-01T12:00:00Z');
const LATER = new Date('2099-06-01T19:00:00Z');
const EARLIER = new Date('2099-06-01T11:00:00Z');

const PUBLISHED: AccessEvent = { published: true };
const UNPUBLISHED: AccessEvent = { published: false };

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
	it.each(VIEWERS)('a published Event is seen by the %s viewer, as its announcement', (_, viewer) => {
		expect(eventAccess(PUBLISHED, viewer)).toEqual({ visible: true, view: 'announcement' });
	});

	// The Admin preview of a Draft comes in a later issue (033): until then
	// an unpublished Event is not found for everyone.
	it.each(VIEWERS)('an unpublished Event is hidden from the %s viewer', (_, viewer) => {
		expect(eventAccess(UNPUBLISHED, viewer)).toEqual({ visible: false });
	});
});

describe('listing, indexing and the Spotlight', () => {
	it.each([
		[PUBLISHED, true],
		[UNPUBLISHED, false],
	])('event %o — listed, indexed and Spotlight-able: %s', (event, expected) => {
		expect(isListed(event)).toBe(expected);
		expect(isIndexed(event)).toBe(expected);
		expect(canBeSpotlight(event)).toBe(expected);
	});
});

describe('seatingBooking', () => {
	// Every published × viewer × Seating-state combination. The first
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
	for (const [eventName, event] of [['published', PUBLISHED], ['unpublished', UNPUBLISHED]] as const) {
		for (const [viewerName, viewer] of VIEWERS) {
			for (const [stateName, state, reason] of SEATING_STATES) {
				cases.push([
					eventName,
					event,
					viewerName,
					viewer,
					stateName,
					state,
					event.published ? reason : 'event-not-published',
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
		expect(seatingBooking({ event: PUBLISHED, seating: state, viewer: ANONYMOUS, now: NOW, seats: 2 }))
			.toEqual({ bookable: true });
		expect(seatingBooking({ event: PUBLISHED, seating: state, viewer: ANONYMOUS, now: NOW, seats: 3 }))
			.toEqual({ bookable: false, reason: 'full' });
	});
});

describe('waitlistAccess', () => {
	it.each(VIEWERS)('a full Seating of a published Event can be wait-listed (%s viewer)', (_, viewer) => {
		expect(waitlistAccess({ event: PUBLISHED, seating: seating({ availableCapacity: 0 }), viewer, now: NOW }))
			.toEqual({ allowed: true });
	});

	it('being full is not a reason to refuse it', () => {
		expect(waitlistAccess({ event: PUBLISHED, seating: seating(), viewer: ANONYMOUS, now: NOW }))
			.toEqual({ allowed: true });
	});

	it.each([
		['an unpublished Event', UNPUBLISHED, seating({ availableCapacity: 0 }), 'event-not-published'],
		['an unpublished Seating', PUBLISHED, seating({ published: false }), 'seating-unpublished'],
		['an unpriced Seating', PUBLISHED, seating({ priced: false }), 'not-priced'],
		['a started Seating', PUBLISHED, seating({ startTime: EARLIER }), 'started'],
		['a Seating without a Waitlist', PUBLISHED, seating({ allowWaitlist: false }), 'waitlist-not-offered'],
	])('refuses %s', (_, event, state, reason) => {
		for (const [, viewer] of VIEWERS) {
			expect(waitlistAccess({ event, seating: state, viewer, now: NOW })).toEqual({ allowed: false, reason });
		}
	});
});

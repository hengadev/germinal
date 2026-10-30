/**
 * Staff access (issue 014) — a pure module with no database access that
 * every Staff page and action asks before doing anything.
 *
 * Given who is asking (a Staff member's Assignment, or an Admin), the
 * Event's Days and Time Zone, and an instant, it answers: which Staff
 * Permissions are effective, and which Day's Guests (if any) are visible
 * right now. A Day runs from midnight to 6 a.m. the next morning, on the
 * Event's clock (see `CONTEXT.md`: Day).
 */

import {
	STAFF_PERMISSIONS,
	withImpliedPermissions,
	type StaffPermission,
} from './permissions';
import { dayStart, wallClockToInstant } from '../utils/event-time';

/**
 * Who is asking. An Admin holds every permission at every Event without an
 * Assignment; a Staff member is their Assignment: the Staff Role's
 * permissions plus the Assignment's grants and withdrawals.
 */
export type StaffWho =
	| { kind: 'admin' }
	| {
			kind: 'assignment';
			rolePermissions: Iterable<StaffPermission>;
			granted?: Iterable<StaffPermission>;
			withdrawn?: Iterable<StaffPermission>;
	  };

/** Permissions that read or act on Guests: everything except Tasks. */
export const GUEST_PERMISSIONS: ReadonlySet<StaffPermission> = new Set(
	STAFF_PERMISSIONS.filter((p) => p !== 'tasks')
);

/**
 * The effective permissions of `who`: for an Assignment, the Staff Role's
 * permissions plus grants, minus withdrawals, then the dependency closure
 * (withdrawals apply *before* the closure — withdrawing `guest_list` while
 * keeping `scan_check_in` re-adds it: acting on parties implies the guest
 * list). Dietary Requirements alone do not imply the guest list.
 */
export function effectivePermissions(who: StaffWho): StaffPermission[] {
	if (who.kind === 'admin') return [...STAFF_PERMISSIONS];
	const base = new Set<StaffPermission>(who.rolePermissions);
	for (const p of who.granted ?? []) base.add(p);
	for (const p of who.withdrawn ?? []) base.delete(p);
	return withImpliedPermissions(base);
}

/** Minutes after midnight of a Day at which the Day's window closes. */
const DAY_END_MINUTES = 6 * 60;

/**
 * The Day whose window (`[Day 00:00, next morning 06:00[` on the Event's
 * clock) contains `now`, or null outside every Day. Days need not be
 * consecutive; when two windows overlap (consecutive Days, between 00:00
 * and 06:00), the later Day wins.
 */
export function activeDay(eventDays: string[], timeZone: string, now: Date): string | null {
	const instant = now.getTime();
	let result: string | null = null;
	for (const day of eventDays) {
		const start = dayStart(day, timeZone).getTime();
		const end = wallClockToInstant(day, DAY_END_MINUTES + 24 * 60, timeZone).getTime();
		if (instant >= start && instant < end && (result === null || day > result)) {
			result = day;
		}
	}
	return result;
}

export interface StaffAccess {
	/** Effective permissions after the dependency closure. */
	permissions: StaffPermission[];
	/** The Day whose Guests are visible right now, or null outside a Day. */
	day: string | null;
	/** May the caller see Guests at all (a visible Day and the guest list)? */
	canSeeGuests: boolean;
	/**
	 * Whether `perm` is usable right now: Tasks also works outside a Day;
	 * guest-related permissions only inside the visible Day.
	 */
	can: (perm: StaffPermission) => boolean;
}

/**
 * Everything a Staff page or action needs before doing anything: the
 * effective permissions of `who`, and which Day's Guests are visible at
 * `now` for an Event whose Days are `eventDays` in `timeZone`.
 */
export function staffAccess(who: StaffWho, eventDays: string[], timeZone: string, now: Date): StaffAccess {
	const permissions = effectivePermissions(who);
	const day = activeDay(eventDays, timeZone, now);
	const held = new Set<StaffPermission>(permissions);
	const can = (perm: StaffPermission) => held.has(perm) && (!GUEST_PERMISSIONS.has(perm) || day !== null);
	return {
		permissions,
		day,
		canSeeGuests: day !== null && held.has('guest_list'),
		can,
	};
}

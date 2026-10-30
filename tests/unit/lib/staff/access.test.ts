// @vitest-environment node
/**
 * Issue 014 — the pure Staff access module: effective permissions over a
 * Staff Role, the dependency closure, Admins without an Assignment, the
 * Day window edges in a non-Paris zone, non-consecutive Days, and Tasks
 * usable outside a Day.
 */
import { describe, it, expect } from 'vitest';
import {
	effectivePermissions,
	activeDay,
	staffAccess,
} from '../../../../src/lib/staff/access';
import { STAFF_PERMISSIONS, type StaffPermission } from '../../../../src/lib/staff/permissions';

function assignment(
	rolePermissions: StaffPermission[],
	granted: StaffPermission[] = [],
	withdrawn: StaffPermission[] = []
) {
	return {
		kind: 'assignment' as const,
		rolePermissions,
		granted,
		withdrawn,
	};
}

describe('effectivePermissions', () => {
	it('returns every permission for an Admin without an Assignment', () => {
		expect(effectivePermissions({ kind: 'admin' }).sort()).toEqual([...STAFF_PERMISSIONS].sort());
	});

	it('adds grants over the Staff Role and subtracts withdrawals', () => {
		const who = assignment(['tasks', 'guest_list'], ['dietary'], ['guest_list']);
		// dietary alone does not imply the guest list
		expect(effectivePermissions(who)).toEqual(['tasks', 'dietary']);
	});

	it('applies the dependency closure after withdrawals (acting on parties implies the guest list)', () => {
		const who = assignment(['tasks', 'scan_check_in', 'guest_list'], [], ['guest_list']);
		// guest_list withdrawn, but scan_check_in re-adds it through the closure
		expect(effectivePermissions(who)).toEqual(['tasks', 'guest_list', 'scan_check_in']);
	});

	it('keeps dietary requirements without implying the guest list', () => {
		const who = assignment(['dietary']);
		expect(effectivePermissions(who)).toEqual(['dietary']);
	});

	it('closes grants over a role that lacked the guest list', () => {
		const who = assignment(['tasks'], ['manual_check_in']);
		expect(effectivePermissions(who)).toEqual(['tasks', 'guest_list', 'manual_check_in']);
	});
});

describe('activeDay', () => {
	const zone = 'America/New_York';
	const days = ['2026-07-10', '2026-07-11'];

	it('finds the Day at its edges (23:59, 00:00, 05:59, 06:00)', () => {
		const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-04:00`); // EDT in July
		// 23:59 on the 10th: still Day 10
		expect(activeDay(days, zone, at('2026-07-10', '23:59'))).toBe('2026-07-10');
		// 00:00 on the 11th: Day 11's window starts, and it wins over Day 10's tail
		expect(activeDay(days, zone, at('2026-07-11', '00:00'))).toBe('2026-07-11');
		// 05:59 on the 11th: last minute of Day 10's and of Day 11's window
		expect(activeDay(days, zone, at('2026-07-11', '05:59'))).toBe('2026-07-11');
		// 06:00 on the 11th: Day 10's window closed, but Day 11's own window runs to the 12th 06:00
		expect(activeDay(days, zone, at('2026-07-11', '06:00'))).toBe('2026-07-11');
		// 06:00 on the 12th: Day 11's window closes, Day 12 doesn't exist
		expect(activeDay(days, zone, at('2026-07-12', '06:00'))).toBe(null);
	});

	it('answers null between non-consecutive Days', () => {
		const sparse = ['2026-07-10', '2026-07-14'];
		expect(activeDay(sparse, zone, new Date('2026-07-12T12:00:00-04:00'))).toBe(null);
		// The 13th at 02:00 is inside no window (the 10th's closed at 06:00 on the 11th)
		expect(activeDay(sparse, zone, new Date('2026-07-13T02:00:00-04:00'))).toBe(null);
		expect(activeDay(sparse, zone, new Date('2026-07-14T02:00:00-04:00'))).toBe('2026-07-14');
	});

	it('gives the overlap between consecutive Days to the later Day', () => {
		// Between 00:00 and 06:00 on the 11th both windows match; later wins.
		expect(activeDay(days, zone, new Date('2026-07-11T03:00:00-04:00'))).toBe('2026-07-11');
		// Order of the input must not matter
		expect(activeDay([...days].reverse(), zone, new Date('2026-07-11T03:00:00-04:00'))).toBe('2026-07-11');
	});
});

describe('staffAccess', () => {
	const zone = 'America/New_York';

	it('lets Tasks work outside a Day, and guest permissions only inside one', () => {
		const who = assignment(['tasks', 'scan_check_in']);
		const outside = staffAccess(who, ['2026-07-10'], zone, new Date('2026-07-15T12:00:00-04:00'));
		expect(outside.day).toBe(null);
		expect(outside.canSeeGuests).toBe(false);
		expect(outside.can('tasks')).toBe(true);
		expect(outside.can('guest_list')).toBe(false);
		expect(outside.can('scan_check_in')).toBe(false);

		const inside = staffAccess(who, ['2026-07-10'], zone, new Date('2026-07-10T19:00:00-04:00'));
		expect(inside.day).toBe('2026-07-10');
		expect(inside.canSeeGuests).toBe(true);
		expect(inside.can('guest_list')).toBe(true);
		expect(inside.can('scan_check_in')).toBe(true);
	});

	it('refuses a permission the Assignment lacks even inside a Day', () => {
		const who = assignment(['tasks', 'dietary']);
		const inside = staffAccess(who, ['2026-07-10'], zone, new Date('2026-07-10T19:00:00-04:00'));
		expect(inside.can('dietary')).toBe(true);
		expect(inside.can('contact')).toBe(false);
	});

	it('gives an Admin everything, and a Day whenever one is active', () => {
		const access = staffAccess({ kind: 'admin' }, ['2026-07-10'], zone, new Date('2026-07-10T19:00:00-04:00'));
		expect(access.can('comp')).toBe(true);
		expect(access.canSeeGuests).toBe(true);
		expect(access.day).toBe('2026-07-10');
	});

	it('gives an Admin Tasks even outside every Day', () => {
		const access = staffAccess({ kind: 'admin' }, ['2026-07-10'], zone, new Date('2026-07-15T12:00:00-04:00'));
		expect(access.day).toBe(null);
		expect(access.can('tasks')).toBe(true);
		expect(access.canSeeGuests).toBe(false);
	});
});


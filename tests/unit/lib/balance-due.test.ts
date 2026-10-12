import { describe, it, expect } from 'vitest';
import {
	reservationAmounts,
	balanceToCollect,
	totalBalanceToCollect,
	filterReservations,
	seatingFilterOptions,
} from '../../../src/lib/utils/balance-due';

describe('reservationAmounts', () => {
	it('returns the stored total, Deposit and Balance', () => {
		expect(
			reservationAmounts({ status: 'confirmed', totalAmount: 13000, depositAmount: 4000, balanceAmount: 9000 })
		).toEqual({ total: 13000, deposit: 4000, balance: 9000 });
	});

	it('shows a zero Balance (and zero everything) for Comp Reservations', () => {
		expect(
			reservationAmounts({ status: 'confirmed', isComp: true, totalAmount: 0, depositAmount: 0, balanceAmount: 0 })
		).toEqual({ total: 0, deposit: 0, balance: 0 });
	});

	it('treats rows without a stored split (mock data) as paid in full online', () => {
		expect(reservationAmounts({ status: 'confirmed', totalAmount: 9000 })).toEqual({
			total: 9000,
			deposit: 9000,
			balance: 0,
		});
	});
});

describe('balanceToCollect', () => {
	const split = { totalAmount: 13000, depositAmount: 4000, balanceAmount: 9000 };

	it('is the stored Balance for live bookings', () => {
		expect(balanceToCollect({ ...split, status: 'confirmed' })).toBe(9000);
		expect(balanceToCollect({ ...split, status: 'pending' })).toBe(9000);
		expect(balanceToCollect({ ...split, status: 'processing' })).toBe(9000);
	});

	it('is null (nothing to collect) for cancelled or expired bookings', () => {
		expect(balanceToCollect({ ...split, status: 'cancelled' })).toBeNull();
		expect(balanceToCollect({ ...split, status: 'expired' })).toBeNull();
	});

	it('is zero for a confirmed Comp Reservation', () => {
		expect(
			balanceToCollect({ status: 'confirmed', isComp: true, totalAmount: 0, depositAmount: 0, balanceAmount: 0 })
		).toBe(0);
	});
});

describe('totalBalanceToCollect', () => {
	it('sums the Balances of confirmed Reservations only', () => {
		expect(
			totalBalanceToCollect([
				{ status: 'confirmed', totalAmount: 13000, depositAmount: 4000, balanceAmount: 9000 },
				{ status: 'confirmed', totalAmount: 6500, depositAmount: 2000, balanceAmount: 4500 },
				{ status: 'confirmed', isComp: true, totalAmount: 0, depositAmount: 0, balanceAmount: 0 },
				{ status: 'pending', totalAmount: 6500, depositAmount: 2000, balanceAmount: 4500 },
				{ status: 'cancelled', totalAmount: 6500, depositAmount: 2000, balanceAmount: 4500 },
				{ status: 'expired', totalAmount: 6500, depositAmount: 2000, balanceAmount: 4500 },
			])
		).toBe(13500);
	});
});

const row = (over: Partial<Parameters<typeof filterReservations>[0][number]> = {}) => ({
	status: 'confirmed',
	seatingId: 's-lunch',
	sessionTitle: 'Lunch — Wednesday 10 June 2099, 12:00',
	sessionStartTime: '2099-06-10T12:00:00.000Z',
	guestName: 'Alice Example',
	guestEmail: 'alice@example.com',
	eventTitle: 'Summer Table',
	...over,
});

describe('filterReservations', () => {
	const rows = [
		row({ guestName: 'Alice' }),
		row({ guestName: 'Bob', seatingId: 's-dinner', sessionTitle: 'Dinner', status: 'cancelled' }),
		row({ guestName: 'Cleo', seatingId: 's-dinner', sessionTitle: 'Dinner' }),
	];

	it('keeps every row with no filter', () => {
		expect(filterReservations(rows, {})).toHaveLength(3);
		expect(filterReservations(rows, { status: 'all', seatingId: 'all', search: '  ' })).toHaveLength(3);
	});

	it('filters by Seating', () => {
		expect(filterReservations(rows, { seatingId: 's-dinner' }).map((r) => r.guestName)).toEqual(['Bob', 'Cleo']);
	});

	it('combines Seating, status and search', () => {
		expect(
			filterReservations(rows, { seatingId: 's-dinner', status: 'confirmed' }).map((r) => r.guestName)
		).toEqual(['Cleo']);
		expect(filterReservations(rows, { seatingId: 's-lunch', search: 'cleo' })).toHaveLength(0);
		expect(filterReservations(rows, { search: 'DINNER' }).map((r) => r.guestName)).toEqual(['Bob', 'Cleo']);
	});
});

describe('seatingFilterOptions', () => {
	it('lists each Seating once, chronologically', () => {
		const rows = [
			row({ seatingId: 's-dinner', sessionTitle: 'Dinner', sessionStartTime: '2099-06-10T19:00:00.000Z' }),
			row({ seatingId: 's-lunch', sessionTitle: 'Lunch', sessionStartTime: '2099-06-10T12:00:00.000Z' }),
			row({ seatingId: 's-dinner', sessionTitle: 'Dinner', sessionStartTime: '2099-06-10T19:00:00.000Z' }),
		];
		expect(seatingFilterOptions(rows)).toEqual([
			{ id: 's-lunch', label: 'Lunch' },
			{ id: 's-dinner', label: 'Dinner' },
		]);
	});

	it('prefixes the Event title when the list spans several Events', () => {
		expect(seatingFilterOptions([row({ sessionTitle: 'Lunch' })], { withEvent: true })).toEqual([
			{ id: 's-lunch', label: 'Summer Table — Lunch' },
		]);
	});
});

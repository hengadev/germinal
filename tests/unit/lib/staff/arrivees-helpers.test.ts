import { describe, expect, it } from 'vitest';
import { noteCount, currentSeatingId, servicesOf } from '$lib/components/staff/arrivees/helpers';
import type { DayGuestList, DayGuestSeating } from '$lib/server/services/day-guest-list';

function seating(id: string, overrides: Partial<DayGuestSeating> = {}): DayGuestSeating {
	return {
		id,
		serviceId: 'svc-1',
		serviceKind: 'lunch',
		titleFr: null,
		titleEn: null,
		startTime: '2025-06-01T12:00:00.000Z',
		booked: 0,
		totalCapacity: null,
		parties: [],
		...overrides,
	};
}

describe('noteCount', () => {
	it('counts the parties with Dietary Requirements across the whole Day', () => {
		const list: DayGuestList = {
			day: '2025-06-01',
			seatings: [
				seating('a', {
					parties: [
						{ dietaryRequirements: 'Végétarien' },
						{ dietaryRequirements: '   ' },
						{ dietaryRequirements: null },
						{ guestName: 'Sans note' },
					],
				}),
				seating('b', { serviceId: 'svc-2', serviceKind: 'dinner', parties: [{ dietaryRequirements: 'Sans gluten' }] }),
			],
		};
		expect(noteCount(list)).toBe(2);
	});

	it('is zero with no seatings', () => {
		expect(noteCount({ day: '2025-06-01', seatings: [] })).toBe(0);
	});
});

describe('currentSeatingId', () => {
	it('returns the last started Seating, or the first before any has', () => {
		const seatings = [
			seating('lunch-12h', { startTime: '2025-06-01T12:00:00.000Z' }),
			seating('lunch-13h', { startTime: '2025-06-01T13:00:00.000Z' }),
			seating('dinner-20h', { startTime: '2025-06-01T20:00:00.000Z' }),
		];
		expect(currentSeatingId(seatings, new Date('2025-06-01T10:00:00.000Z'))).toBe('lunch-12h');
		expect(currentSeatingId(seatings, new Date('2025-06-01T12:30:00.000Z'))).toBe('lunch-12h');
		expect(currentSeatingId(seatings, new Date('2025-06-01T21:00:00.000Z'))).toBe('dinner-20h');
		expect(currentSeatingId([], new Date())).toBe(null);
	});
});

describe('servicesOf', () => {
	it('groups the Seatings by Service, in order', () => {
		const services = servicesOf([
			seating('a', { serviceId: 'lunch', serviceKind: 'lunch' }),
			seating('b', { serviceId: 'dinner', serviceKind: 'dinner' }),
			seating('c', { serviceId: 'lunch', serviceKind: 'lunch' }),
		]);
		expect(services.map((s) => s.id)).toEqual(['lunch', 'dinner']);
		expect(services[0].seatings.map((s) => s.id)).toEqual(['a', 'c']);
	});
});

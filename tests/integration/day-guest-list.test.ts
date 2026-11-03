// @vitest-environment node
/**
 * Issue 016 — the Arrivées Day guest list: only the current Day's
 * confirmed parties, grouped by Seating, with fields selected strictly per
 * Staff permission. Internal Notes are never returned, nothing leaks from
 * another Day or Event, and the Ticket lookup follows the same rules.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { events, eventDays, eventServices, eventSessions, guestNotes, reservations } from '../../src/lib/server/db/schema';
import { dayOf } from '../../src/lib/utils/event-time';
import { staffAccess, type StaffWho } from '../../src/lib/staff/access';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
}));

beforeEach(async () => {
	await setupTestDatabase();
});

afterAll(async () => {
	await closeTestDatabase();
});

const ZONE = 'Europe/Paris';
const NOTES = 'Notes internes : ne jamais fuiter 06 12 34 56 78';
const NOTE_SECRETE = 'Note admin secrète : ne jamais fuiter au portail Staff';

function accessFor(who: StaffWho, dates: string[], now: Date) {
	return staffAccess(who, dates, ZONE, now);
}

/** An Event with two Days, each with one Service and one Seating. */
async function seed(now: Date) {
	const today = dayOf(now, ZONE);
	const tomorrow = dayOf(new Date(now.getTime() + 24 * 3600 * 1000), ZONE);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startDate: new Date(`${today}T19:00:00Z`),
			endDate: new Date(`${today}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE,
			internalNotes: NOTES,
		})
		.returning();
	const [otherEvent] = await testDb
		.insert(events)
		.values({
			titleEn: 'Other',
			titleFr: 'Autre',
			startDate: new Date(`${today}T19:00:00Z`),
			endDate: new Date(`${today}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE,
			internalNotes: NOTES,
		})
		.returning();

	async function seatingFor(eventId: string, date: string, capacity: number | null) {
		const [day] = await testDb
			.insert(eventDays)
			.values({ eventId, date })
			.returning();
		const [service] = await testDb
			.insert(eventServices)
			.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
			.returning();
		const [seating] = await testDb
			.insert(eventSessions)
			.values({
				eventId,
				serviceId: service.id,
				titleFr: `Service ${date}`,
				startTime: new Date(`${date}T19:00:00Z`),
				endTime: new Date(`${date}T21:00:00Z`),
				totalCapacity: capacity,
				availableCapacity: capacity,
			})
			.returning();
		return { day, service, seating };
	}

	const todaySeating = await seatingFor(event.id, today, 32);
	const tomorrowSeating = await seatingFor(event.id, tomorrow, null);
	const otherSeating = await seatingFor(otherEvent.id, today, null);

	async function reservation(
		seatingId: string,
		name: string,
		opts: {
			quantity?: number;
			status?: 'pending' | 'confirmed' | 'cancelled' | 'expired';
			balance?: number;
			phone?: string | null;
			dietary?: string | null;
			comp?: boolean;
			email?: string | null;
		} = {}
	) {
		const total = 2500 * (opts.quantity ?? 2);
		const [row] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: seatingId,
				guestEmail:
					opts.email === undefined
						? `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`
						: opts.email,
				guestName: name,
				guestPhone: opts.phone === undefined ? '06 11 22 33 44' : opts.phone,
				quantity: opts.quantity ?? 2,
				totalAmount: total,
				depositAmount: total - (opts.balance ?? 0),
				balanceAmount: opts.balance ?? 0,
				currency: 'EUR',
				status: opts.status ?? 'confirmed',
				accessToken: crypto.randomUUID().replace(/-/g, ''),
				expiresAt: new Date(now.getTime() + 3600 * 1000),
				dietaryRequirements: opts.dietary === undefined ? 'Végétarien' : opts.dietary,
				dietaryConsentAt: opts.dietary === undefined || opts.dietary ? now : null,
				isComp: opts.comp ?? false,
			})
			.returning();
		return row;
	}

	return { event, otherEvent, today, tomorrow, todaySeating, tomorrowSeating, otherSeating, reservation };
}

function leaks(data: unknown): boolean {
	const serialized = JSON.stringify(data);
	return serialized.includes(NOTES) || serialized.includes('internalNotes');
}

describe('day guest list', () => {
	it('shows only the current Day’s confirmed parties, grouped by Seating, with the guest-list fields only', async () => {
		const now = new Date();
		const s = await seed(now);
		await s.reservation(s.todaySeating.seating.id, 'Alice Martin', { quantity: 3, balance: 2000 });
		await s.reservation(s.todaySeating.seating.id, 'Bob Durand', { quantity: 2 });
		await s.reservation(s.todaySeating.seating.id, 'Annulée', { status: 'cancelled' });
		await s.reservation(s.todaySeating.seating.id, 'En attente', { status: 'pending' });
		await s.reservation(s.tomorrowSeating.seating.id, 'Demain Invité');
		await s.reservation(s.otherSeating.seating.id, 'Autre événement');

		const access = accessFor(
			{ kind: 'assignment', rolePermissions: ['guest_list'] },
			[s.today, s.tomorrow],
			now
		);
		const svc = await import('../../src/lib/server/services/day-guest-list');
		const list = await svc.getDayGuestList(access, s.event.id);

		expect(list).not.toBeNull();
		expect(list!.day).toBe(s.today);
		expect(list!.seatings).toHaveLength(1); // only today's Seating
		const seating = list!.seatings[0];
		expect(seating.id).toBe(s.todaySeating.seating.id);
		expect(seating.parties.map((p) => p.guestName).sort()).toEqual(['Alice Martin', 'Bob Durand']);
		expect(seating.booked).toBe(5);
		expect(seating.totalCapacity).toBe(32);

		// Exactly the guest-list fields, nothing more.
		expect(Object.keys(seating.parties[0]).sort()).toEqual(
			['arrived', 'balanceAmount', 'balanceSettledAt', 'balanceSettledByName', 'currency', 'giftCardPaidAtDoor', 'lastMovedAt', 'lastMovedByName', 'guestName', 'id', 'isComp', 'lastCheckInAt', 'origin', 'quantity', 'tags', 'visitNumber', 'extras'].sort()
		);
		expect(leaks(list)).toBe(false);
	});

	it('Cuisine (dietary without guest list) gets only name, size and Dietary Requirements', async () => {
		const now = new Date();
		const s = await seed(now);
		await s.reservation(s.todaySeating.seating.id, 'Alice Martin', { quantity: 3, balance: 2000 });
		await s.reservation(s.tomorrowSeating.seating.id, 'Demain Invité');

		const access = accessFor(
			{ kind: 'assignment', rolePermissions: ['dietary'] },
			[s.today, s.tomorrow],
			now
		);
		const svc = await import('../../src/lib/server/services/day-guest-list');
		const list = await svc.getDayGuestList(access, s.event.id);

		expect(list).not.toBeNull();
		expect(list!.seatings).toHaveLength(1);
		const party = list!.seatings[0].parties[0];
		expect(Object.keys(party).sort()).toEqual(['dietaryRequirements', 'guestName', 'quantity'].sort());
		expect(party.dietaryRequirements).toBe('Végétarien');
		expect(party.guestPhone).toBeUndefined();
		expect(party.balanceAmount).toBeUndefined();
		expect(leaks(list)).toBe(false);
	});

	it('contact details appear only with that permission', async () => {
		const now = new Date();
		const s = await seed(now);
		await s.reservation(s.todaySeating.seating.id, 'Alice Martin', { phone: '06 99 88 77 66' });

		const svc = await import('../../src/lib/server/services/day-guest-list');
		const withContact = accessFor(
			{ kind: 'assignment', rolePermissions: ['guest_list', 'contact'] },
			[s.today, s.tomorrow],
			now
		);
		const list = await svc.getDayGuestList(withContact, s.event.id);
		const party = list!.seatings[0].parties[0];
		expect(party.guestPhone).toBe('06 99 88 77 66');
		expect(Object.keys(party).sort()).toEqual(
			['arrived', 'balanceAmount', 'balanceSettledAt', 'balanceSettledByName', 'currency', 'giftCardPaidAtDoor', 'lastMovedAt', 'lastMovedByName', 'guestEmail', 'guestName', 'guestPhone', 'id', 'isComp', 'lastCheckInAt', 'origin', 'quantity', 'tags', 'visitNumber', 'extras'].sort()
		);

		const withoutContact = accessFor(
			{ kind: 'assignment', rolePermissions: ['guest_list'] },
			[s.today, s.tomorrow],
			now
		);
		const bare = await svc.getDayGuestList(withoutContact, s.event.id);
		expect(bare!.seatings[0].parties[0].guestPhone).toBeUndefined();
		expect(bare!.seatings[0].parties[0].guestEmail).toBeUndefined();
	});

	it('returns nothing outside a Day window', async () => {
		const now = new Date();
		const s = await seed(now);
		await s.reservation(s.todaySeating.seating.id, 'Alice Martin');

		const svc = await import('../../src/lib/server/services/day-guest-list');
		const outside = accessFor({ kind: 'admin' }, ['2100-01-01'], now);
		expect(await svc.getDayGuestList(outside, s.event.id)).toBeNull();
		expect(await svc.lookupTicket(outside, s.event.id, 'whatever')).toBeNull();
	});

	it('a Seating without capacity shows only the count', async () => {
		const now = new Date();
		const s = await seed(now);
		await s.reservation(s.tomorrowSeating.seating.id, 'Alice Martin');
		// The Day window is the later Day (tomorrow 00:00–06:00 is still
		// today's window too, so move `now` into tomorrow instead).
		const tomorrowEvening = new Date(`${s.tomorrow}T20:00:00Z`);
		const access = accessFor({ kind: 'admin' }, [s.today, s.tomorrow], tomorrowEvening);
		const svc = await import('../../src/lib/server/services/day-guest-list');
		const list = await svc.getDayGuestList(access, s.event.id);
		expect(list!.day).toBe(s.tomorrow);
		const seating = list!.seatings[0];
		expect(seating.totalCapacity).toBeNull();
		expect(seating.booked).toBe(2);
	});

	it('the Ticket lookup applies the same shaping and Day rule', async () => {
		const now = new Date();
		const s = await seed(now);
		const todayTicket = await s.reservation(s.todaySeating.seating.id, 'Alice Martin', { quantity: 4 });
		const tomorrowTicket = await s.reservation(s.tomorrowSeating.seating.id, 'Demain Invité');
		const otherTicket = await s.reservation(s.otherSeating.seating.id, 'Autre événement');
		const cancelled = await s.reservation(s.todaySeating.seating.id, 'Annulée', { status: 'cancelled' });

		const access = accessFor(
			{ kind: 'assignment', rolePermissions: ['guest_list', 'contact'] },
			[s.today, s.tomorrow],
			now
		);
		const svc = await import('../../src/lib/server/services/day-guest-list');

		const party = await svc.lookupTicket(access, s.event.id, todayTicket.accessToken);
		expect(party).not.toBeNull();
		expect(party!.guestName).toBe('Alice Martin');
		expect(Object.keys(party!).sort()).toEqual(
			['arrived', 'balanceAmount', 'balanceSettledAt', 'balanceSettledByName', 'currency', 'giftCardPaidAtDoor', 'lastMovedAt', 'lastMovedByName', 'guestEmail', 'guestName', 'guestPhone', 'id', 'isComp', 'lastCheckInAt', 'origin', 'quantity', 'tags', 'visitNumber', 'extras'].sort()
		);

		// Another Day, another Event, a cancelled Ticket: all refused.
		expect(await svc.lookupTicket(access, s.event.id, tomorrowTicket.accessToken)).toBeNull();
		expect(await svc.lookupTicket(access, s.event.id, otherTicket.accessToken)).toBeNull();
		expect(await svc.lookupTicket(access, s.event.id, cancelled.accessToken)).toBeNull();
		expect(await svc.lookupTicket(access, s.event.id, 'no-such-token')).toBeNull();
		expect(leaks(party)).toBe(false);
	});

	it('adds each Guest’s tags and visit number, and never the note (issue 051)', async () => {
		const now = new Date();
		const s = await seed(now);
		// A Seating the day before, for the same Event.
		const yesterday = dayOf(new Date(now.getTime() - 24 * 3600 * 1000), ZONE);
		const [earlierDay] = await testDb
			.insert(eventDays)
			.values({ eventId: s.event.id, date: yesterday })
			.returning();
		const [earlierService] = await testDb
			.insert(eventServices)
			.values({ dayId: earlierDay.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
			.returning();
		const [earlierSeating] = await testDb
			.insert(eventSessions)
			.values({
				eventId: s.event.id,
				serviceId: earlierService.id,
				titleFr: 'Service veille',
				startTime: new Date(`${yesterday}T19:00:00Z`),
				endTime: new Date(`${yesterday}T21:00:00Z`)
			})
			.returning();

		// Alice: a confirmed visit yesterday, plus a pending and a cancelled one
		// that must not count.
		await s.reservation(earlierSeating.id, 'Alice Martin');
		await s.reservation(earlierSeating.id, 'Alice Martin', { status: 'pending' });
		await s.reservation(earlierSeating.id, 'Alice Martin', { status: 'cancelled' });
		// Another Event’s visit at the same time: not earlier, not counted.
		await s.reservation(s.otherSeating.seating.id, 'Alice Martin');
		// Another Event’s visit the day before: visits count across Events.
		const [otherEarlierDay] = await testDb
			.insert(eventDays)
			.values({ eventId: s.otherEvent.id, date: yesterday })
			.returning();
		const [otherEarlierService] = await testDb
			.insert(eventServices)
			.values({ dayId: otherEarlierDay.id, kind: 'lunch', defaultSeatingDurationMinutes: 120 })
			.returning();
		const [otherEarlierSeating] = await testDb
			.insert(eventSessions)
			.values({
				eventId: s.otherEvent.id,
				serviceId: otherEarlierService.id,
				titleFr: 'Autre veille',
				startTime: new Date(`${yesterday}T12:00:00Z`),
				endTime: new Date(`${yesterday}T14:00:00Z`)
			})
			.returning();
		await s.reservation(otherEarlierSeating.id, 'Alice Martin');
		// Today: Alice’s third visit, Bob’s first, Carol without an email.
		await s.reservation(s.todaySeating.seating.id, 'Alice Martin');
		await s.reservation(s.todaySeating.seating.id, 'Bob Durand');
		await s.reservation(s.todaySeating.seating.id, 'Carol Sansmail', { email: null });

		await testDb.insert(guestNotes).values({
			email: 'alice.martin@example.com',
			note: NOTE_SECRETE,
			tags: ['VIP', 'Panneau rouge']
		});

		const access = accessFor(
			{ kind: 'assignment', rolePermissions: ['guest_list', 'contact'] },
			[s.today, s.tomorrow],
			now
		);
		const svc = await import('../../src/lib/server/services/day-guest-list');
		const list = await svc.getDayGuestList(access, s.event.id);

		const byName = new Map(list!.seatings[0].parties.map((p) => [p.guestName, p]));
		expect(byName.get('Alice Martin')!.tags).toEqual(['VIP', 'Panneau rouge']);
		expect(byName.get('Alice Martin')!.visitNumber).toBe(3);
		expect(byName.get('Bob Durand')!.tags).toEqual([]);
		expect(byName.get('Bob Durand')!.visitNumber).toBe(1);
		// No email: no tags, no visit number.
		const carol = byName.get('Carol Sansmail')!;
		expect(carol.tags).toBeUndefined();
		expect(carol.visitNumber).toBeUndefined();

		// The Admin note never leaves the service.
		expect(leaks(list)).toBe(false);
		expect(JSON.stringify(list)).not.to.include(NOTE_SECRETE);

		// Without the contact details, tags and visits still show, and no email does.
		const door = accessFor({ kind: 'assignment', rolePermissions: ['guest_list'] }, [s.today, s.tomorrow], now);
		const doorList = await svc.getDayGuestList(door, s.event.id);
		const alice = doorList!.seatings[0].parties.find((p) => p.guestName === 'Alice Martin')!;
		expect(alice.tags).toEqual(['VIP', 'Panneau rouge']);
		expect(alice.visitNumber).toBe(3);
		expect(alice.guestEmail).toBeUndefined();
	});
});

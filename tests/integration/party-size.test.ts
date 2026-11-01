// @vitest-environment node
/**
 * Issue 046 — change a confirmed Reservation's number of Guests: the
 * Seating's seats move (additions may go beyond capacity, removals give
 * them back), the money follows the quote, the settled mark is cleared
 * when the Balance grows, the change is audited, and the Guest is emailed
 * with the new number and what is left to pay on site.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	auditLog,
	checkIns,
	events,
	eventDays,
	eventServices,
	eventSessions,
	payments,
	reservations,
	users,
} from '../../src/lib/server/db/schema';
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

// Email mocked at the service boundary (prior art: moves.test.ts).
const sendReservationModifiedEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/server/services/email', () => ({
	sendReservationModifiedEmail: sendReservationModifiedEmailMock,
}));

beforeEach(async () => {
	await setupTestDatabase();
	sendReservationModifiedEmailMock.mockClear();
});

afterAll(async () => {
	await closeTestDatabase();
});

/**
 * An Event with one Day, one dinner Service and one Seating of 10 seats
 * (8 available), plus an Admin actor.
 */
async function seed() {
	const [actor] = await testDb
		.insert(users)
		.values({
			email: `actor-${crypto.randomUUID()}@example.com`,
			firstName: 'Anne',
			lastName: 'Mine',
			passwordHash: 'x',
			role: 'admin',
		})
		.returning();
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startDate: new Date('2030-05-01T12:00:00Z'),
			endDate: new Date('2030-05-02T22:00:00Z'),
			visibility: 'public',
			timeZone: 'Europe/Paris',
		})
		.returning();
	const [day] = await testDb
		.insert(eventDays)
		.values({ eventId: event.id, date: '2030-05-01' })
		.returning();
	const [dinner] = await testDb
		.insert(eventServices)
		.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: dinner.id,
			startTime: new Date('2030-05-01T19:00:00Z'),
			endTime: new Date('2030-05-01T21:00:00Z'),
			totalCapacity: 10,
			availableCapacity: 8,
		})
		.returning();

	// 4 Guests at 25.00: total 100.00, Deposit 50.00 paid online,
	// Balance 50.00 on site.
	async function reservation(opts: { locale?: 'fr' | 'en'; isComp?: boolean } = {}) {
		const [row] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: seating.id,
				guestEmail: `guest-${crypto.randomUUID()}@example.com`,
				guestName: 'Alice Martin',
				locale: opts.locale ?? null,
				isComp: opts.isComp ?? false,
				quantity: 4,
				totalAmount: opts.isComp ? 0 : 10000,
				depositAmount: opts.isComp ? 0 : 5000,
				balanceAmount: opts.isComp ? 0 : 5000,
				currency: 'EUR',
				status: 'confirmed',
				accessToken: crypto.randomUUID().replace(/-/g, ''),
				expiresAt: new Date(Date.now() + 3600 * 1000),
			})
			.returning();
		if (!opts.isComp) {
			await testDb.insert(payments).values({
				reservationId: row.id,
				stripePaymentIntentId: `pi_${crypto.randomUUID()}`,
				amount: 5000,
				status: 'succeeded',
				idempotencyKey: crypto.randomUUID(),
			});
			const [withPayment] = await testDb
				.update(reservations)
				.set({ paymentId: null })
				.where(eq(reservations.id, row.id))
				.returning({ id: reservations.id });
			// Link the payment we just created.
			const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, row.id));
			await testDb.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, withPayment.id));
		}
		return row;
	}

	return { event, seating, actor, reservation };
}

const svc = () => import('../../src/lib/server/services/party-size');

describe('changeGuests', () => {
	it('adds Guests: seats taken, total and Balance grow, settled mark cleared, audited, email queued', async () => {
		const s = await seed();
		const party = await s.reservation();
		await testDb
			.update(reservations)
			.set({ balanceSettledAt: new Date(), balanceSettledBy: s.actor.id })
			.where(eq(reservations.id, party.id));

		const result = await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 6,
			actorId: s.actor.id,
		});
		expect(result).toMatchObject({ ok: true, overflow: 0, quantity: 6, balance: 10000 });

		const [row] = await testDb.select().from(reservations).where(eq(reservations.id, party.id));
		expect(row.quantity).toBe(6);
		expect(row.totalAmount).toBe(15000);
		expect(row.balanceAmount).toBe(10000);
		// The settled mark is cleared: the extra is collected.
		expect(row.balanceSettledAt).toBeNull();
		expect(row.balanceSettledBy).toBeNull();
		// The Ticket keeps working.
		expect(row.accessToken).toBe(party.accessToken);

		const [seatingRow] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, s.seating.id));
		expect(seatingRow.availableCapacity).toBe(6);

		const [audit] = await testDb.select().from(auditLog).where(eq(auditLog.entityId, party.id));
		expect(audit.action).toBe('reservation.change_guests');
		expect(audit.adminId).toBe(s.actor.id);
		expect(audit.metadata).toMatchObject({
			before: { quantity: 4, total: 10000, balance: 5000 },
			after: { quantity: 6, total: 15000, balance: 10000 },
		});

		expect(sendReservationModifiedEmailMock).toHaveBeenCalledTimes(1);
		const email = sendReservationModifiedEmailMock.mock.calls[0][0];
		expect(email.guestEmail).toBe(party.guestEmail);
		expect(email.partyChange).toEqual({ quantity: 6, balanceDue: 10000, currency: 'EUR' });
	});

	it('removes Guests: seats given back and the Balance shrinks first', async () => {
		const s = await seed();
		const party = await s.reservation();

		const result = await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 2,
			actorId: s.actor.id,
		});
		expect(result).toMatchObject({ ok: true, quantity: 2, total: 5000, balance: 0 });

		const [row] = await testDb.select().from(reservations).where(eq(reservations.id, party.id));
		expect(row.totalAmount).toBe(5000);
		expect(row.balanceAmount).toBe(0);

		const [seatingRow] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, s.seating.id));
		// The party still holds 2 of the 10 seats.
		expect(seatingRow.availableCapacity).toBe(8);
	});

	it('goes beyond capacity without refusing, and says by how much', async () => {
		const s = await seed();
		const party = await s.reservation();
		await testDb
			.update(eventSessions)
			.set({ availableCapacity: 1 })
			.where(eq(eventSessions.id, s.seating.id));

		const result = await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 6,
			actorId: s.actor.id,
		});
		// 2 added, 1 available: one seat beyond.
		expect(result).toMatchObject({ ok: true, overflow: 1 });

		const [seatingRow] = await testDb.select().from(eventSessions).where(eq(eventSessions.id, s.seating.id));
		expect(seatingRow.availableCapacity).toBe(0);
	});

	it('refuses below the Guests already checked in', async () => {
		const s = await seed();
		const party = await s.reservation();
		await testDb.insert(checkIns).values({
			reservationId: party.id,
			guests: 3,
			method: 'manual',
			checkedInBy: s.actor.id,
		});

		const result = await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 2,
			actorId: s.actor.id,
		});
		expect(result).toMatchObject({ ok: false });
		expect(!result.ok && result.error).toContain('3');
	});

	it('refuses a removal that would over-pay, changing nothing', async () => {
		const s = await seed();
		const party = await s.reservation();

		// Down to 1 Guest: total 2500 < the 5000 Deposit paid.
		const result = await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 1,
			actorId: s.actor.id,
		});
		expect(result).toMatchObject({ ok: false });

		const [row] = await testDb.select().from(reservations).where(eq(reservations.id, party.id));
		expect(row.quantity).toBe(4);
		expect(sendReservationModifiedEmailMock).not.toHaveBeenCalled();
	});

	it('refuses a Reservation that is not confirmed', async () => {
		const s = await seed();
		const party = await s.reservation();
		await testDb
			.update(reservations)
			.set({ status: 'cancelled' })
			.where(eq(reservations.id, party.id));

		const result = await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 5,
			actorId: s.actor.id,
		});
		expect(result).toMatchObject({ ok: false });
	});

	it('a Comp changes only its quantity: no money involved', async () => {
		const s = await seed();
		const party = await s.reservation({ isComp: true });

		const result = await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 7,
			actorId: s.actor.id,
		});
		expect(result).toMatchObject({ ok: true, quantity: 7, total: 0, balance: 0 });

		const [row] = await testDb.select().from(reservations).where(eq(reservations.id, party.id));
		expect(row.quantity).toBe(7);
		expect(row.totalAmount).toBe(0);
		expect(row.balanceAmount).toBe(0);
	});

	it('emails the Guest in their language with the amount left to pay on site', async () => {
		const s = await seed();
		const party = await s.reservation({ locale: 'fr' });

		await (await svc()).changeGuests({
			reservationId: party.id,
			quantity: 3,
			actorId: s.actor.id,
		});

		expect(sendReservationModifiedEmailMock).toHaveBeenCalledTimes(1);
		const email = sendReservationModifiedEmailMock.mock.calls[0][0];
		expect(email.locale).toBe('fr');
		expect(email.eventTitle).toBe('Dîner');
		expect(email.partyChange).toEqual({ quantity: 3, balanceDue: 2500, currency: 'EUR' });
	});
});

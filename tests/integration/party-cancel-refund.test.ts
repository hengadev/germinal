// @vitest-environment node
/**
 * Issue 041 — cancel a party's Reservation or refund part of what was
 * paid, from the Staff portal: the `cancel_refund` permission, the current
 * Day of this Event, the refund amounts, and the refund figures each
 * party card shows.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	auditLog,
	eventDays,
	eventServices,
	eventSessions,
	events,
	payments,
	reservations,
	users,
} from '../../src/lib/server/db/schema';
import { dayOf } from '../../src/lib/utils/event-time';
import { staffAccess, type StaffWho } from '../../src/lib/staff/access';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn(),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
	// Stripe refunds exactly what it is asked to.
	createRefund: vi.fn(async (_paymentIntentId: string, amount?: number) => ({
		id: 're_test_mock',
		amount: amount ?? 0,
		status: 'succeeded',
	})),
}));

const notifications = vi.hoisted(() => ({
	sendRefundEmail: vi.fn().mockResolvedValue(undefined),
	sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
	sendRefundSMS: vi.fn().mockResolvedValue(undefined),
	sendCancellationSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/email', () => ({
	sendRefundEmail: notifications.sendRefundEmail,
	sendCancellationEmail: notifications.sendCancellationEmail,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendRefundSMS: notifications.sendRefundSMS,
	sendCancellationSMS: notifications.sendCancellationSMS,
}));

vi.mock('../../src/lib/server/services/waitlist', () => ({
	notifyWaitlist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
		RESERVATION_EXPIRY_MINUTES: 15,
		STRIPE_SECRET_KEY: 'sk_test_fake',
		STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
	},
	isStripeEnabled: () => true,
	isAWSConfigured: () => false,
	isBrevoConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

type Service = typeof import('../../src/lib/server/services/party-cancel-refund');
type Stripe = typeof import('../../src/lib/server/services/stripe');
let service: Service;
let stripe: Stripe;

const ZONE = 'Europe/Paris';
const NOW = new Date('2026-06-06T12:00:00+02:00'); // un samedi, pendant le Jour

/** Who holds cancel_refund, as a Staff assignment or an Admin. */
const WITH_PERMISSION: StaffWho = {
	kind: 'assignment',
	rolePermissions: ['cancel_refund'],
};
const WITHOUT_PERMISSION: StaffWho = { kind: 'assignment', rolePermissions: ['settle_balance'] };
const ADMIN: StaffWho = { kind: 'admin' };

beforeEach(async () => {
	await setupTestDatabase();
	vi.clearAllMocks();
	if (!service) {
		service = await import('../../src/lib/server/services/party-cancel-refund');
		stripe = await import('../../src/lib/server/services/stripe');
	}
});

afterAll(async () => {
	await closeTestDatabase();
});

async function seed() {
	const today = dayOf(NOW, ZONE);
	const tomorrow = dayOf(new Date(NOW.getTime() + 24 * 3600 * 1000), ZONE);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Dinner',
			titleFr: 'Dîner',
			startDate: new Date(`${today}T12:00:00Z`),
			endDate: new Date(`${tomorrow}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE,
		})
		.returning();
	const [day] = await testDb.insert(eventDays).values({ eventId: event.id, date: today }).returning();
	const [otherDay] = await testDb
		.insert(eventDays)
		.values({ eventId: event.id, date: tomorrow })
		.returning();
	const [dinner] = await testDb
		.insert(eventServices)
		.values({ dayId: day.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [dinnerTomorrow] = await testDb
		.insert(eventServices)
		.values({ dayId: otherDay.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [seating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: dinner.id,
			startTime: new Date(`${today}T19:00:00Z`),
			endTime: new Date(`${today}T21:00:00Z`),
			totalCapacity: 20,
			availableCapacity: 20,
		})
		.returning();
	const [seatingTomorrow] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: dinnerTomorrow.id,
			startTime: new Date(`${tomorrow}T19:00:00Z`),
			endTime: new Date(`${tomorrow}T21:00:00Z`),
			totalCapacity: 20,
			availableCapacity: 20,
		})
		.returning();

	async function reservation(sessionId: string, name: string, paidOnline?: number, refunded = 0) {
		const [reservation] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: sessionId,
				guestName: name,
				guestEmail: `${name.toLowerCase()}@example.com`,
				quantity: 2,
				status: 'confirmed',
				totalAmount: 5000,
				depositAmount: paidOnline ?? 0,
				balanceAmount: paidOnline === undefined ? 5000 : 5000 - (paidOnline ?? 0),
				currency: 'EUR',
				accessToken: `tok_${crypto.randomUUID()}`,
				expiresAt: new Date(NOW.getTime() - 3600_000),
			})
			.returning();
		if (paidOnline !== undefined) {
			const [payment] = await testDb
				.insert(payments)
				.values({
					reservationId: reservation.id,
					stripePaymentIntentId: `pi_${reservation.id}`,
					idempotencyKey: `ik_${reservation.id}`,
					amount: paidOnline,
					refundedAmount: refunded,
					status: refunded > 0 ? 'partially_refunded' : 'succeeded',
					currency: 'EUR',
				})
				.returning();
			await testDb
				.update(reservations)
				.set({ paymentId: payment.id })
				.where(eq(reservations.id, reservation.id));
		}
		return reservation;
	}

	const alice = await reservation(seating.id, 'Alice', 4000);
	const bobTomorrow = await reservation(seatingTomorrow.id, 'Bob', 3000);
	const walkIn = await reservation(seating.id, 'Walkin'); // rien payé en ligne

	// Une réservation d'un autre événement, le même Jour.
	const [otherEvent] = await testDb
		.insert(events)
		.values({
			titleEn: 'Other',
			titleFr: 'Autre',
			startDate: new Date(`${today}T12:00:00Z`),
			endDate: new Date(`${today}T22:00:00Z`),
			visibility: 'public',
			timeZone: ZONE,
		})
		.returning();
	const [otherEventDay] = await testDb
		.insert(eventDays)
		.values({ eventId: otherEvent.id, date: today })
		.returning();
	const [otherService] = await testDb
		.insert(eventServices)
		.values({ dayId: otherEventDay.id, kind: 'dinner', defaultSeatingDurationMinutes: 120 })
		.returning();
	const [otherSeating] = await testDb
		.insert(eventSessions)
		.values({
			eventId: otherEvent.id,
			serviceId: otherService.id,
			startTime: new Date(`${today}T20:00:00Z`),
			endTime: new Date(`${today}T22:00:00Z`),
		})
		.returning();
	const carole = await reservation(otherSeating.id, 'Carole', 2000);

	const [actor] = await testDb
		.insert(users)
		.values({
			email: `actor-${crypto.randomUUID()}@example.com`,
			firstName: 'Jean',
			lastName: 'Porte',
			passwordHash: 'x',
			role: 'staff',
		})
		.returning();

	return { event, seating, alice, bobTomorrow, walkIn, carole, actor, dates: [today, tomorrow] };
}

function accessFor(who: StaffWho, dates: string[]) {
	return staffAccess(who, dates, ZONE, NOW);
}

describe('cancelParty', () => {
	it('cancels with the confirmed amount and refunds through Stripe', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.cancelParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			cancelledBy: 'guest',
			amount: 2000,
			actorId: actor.id,
			now: NOW,
		});
		expect(result.ok).toBe(true);
		const [row] = await testDb
			.select({ status: reservations.status })
			.from(reservations)
			.where(eq(reservations.id, alice.id));
		expect(row.status).toBe('cancelled');
		expect(stripe.createRefund).toHaveBeenCalledWith('pi_' + alice.id, 2000, expect.anything());
		const [log] = await testDb
			.select()
			.from(auditLog)
			.where(eq(auditLog.entityId, alice.id));
		expect(log.action).toBe('reservation.cancel');
		expect(log.adminId).toBe(actor.id);
	});

	it('cancels as Germinal with the whole refundable amount', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.cancelParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			cancelledBy: 'germinal',
			actorId: actor.id,
			now: NOW,
		});
		expect(result.ok).toBe(true);
		expect(result.ok && result.message).toContain('40');
		expect(stripe.createRefund).toHaveBeenCalledWith('pi_' + alice.id, 4000, expect.anything());
	});

	it('cancels a walk-in without refunding anything', async () => {
		const { event, walkIn, actor, dates } = await seed();
		const result = await service.cancelParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: walkIn.id,
			cancelledBy: 'guest',
			amount: 0,
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({ ok: true, message: 'Réservation annulée, sans remboursement' });
		expect(stripe.createRefund).not.toHaveBeenCalled();
	});

	it('refuses without the permission, even for an Admin-less Staff member', async () => {
		const { event, alice, actor, dates } = await seed();
		for (const who of [WITHOUT_PERMISSION]) {
			const result = await service.cancelParty({
				access: accessFor(who, dates),
				eventId: event.id,
				reservationId: alice.id,
				cancelledBy: 'guest',
				amount: 0,
				actorId: actor.id,
				now: NOW,
			});
			expect(result).toEqual({ ok: false, error: expect.stringContaining('permission') });
		}
	});

	it('refuses another Day’s Reservation, even for an Admin', async () => {
		const { event, bobTomorrow, actor, dates } = await seed();
		const result = await service.cancelParty({
			access: accessFor(ADMIN, dates),
			eventId: event.id,
			reservationId: bobTomorrow.id,
			cancelledBy: 'guest',
			amount: 0,
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({ ok: false, error: "Cette réservation n'est pas pour le jour en cours." });
	});

	it('refuses another Event’s Reservation', async () => {
		const { event, carole, actor, dates } = await seed();
		const result = await service.cancelParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: carole.id,
			cancelledBy: 'guest',
			amount: 0,
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({ ok: false, error: "Cette réservation n'est pas pour le jour en cours." });
	});

	it('refuses an amount above the refundable remainder', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.cancelParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			cancelledBy: 'guest',
			amount: 4001,
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({ ok: false, error: 'Le montant à rembourser dépasse le montant remboursable' });
	});
});

describe('refundParty', () => {
	it('refunds part of what was paid, without cancelling', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.refundParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			amount: 1500,
			actorId: actor.id,
		});
		expect(result.ok).toBe(true);
		const [row] = await testDb
			.select({ status: reservations.status })
			.from(reservations)
			.where(eq(reservations.id, alice.id));
		expect(row.status).toBe('cancelled'); // processRefund's existing behaviour, shared with the admin action
		expect(stripe.createRefund).toHaveBeenCalledWith('pi_' + alice.id, 1500, expect.anything());
		const [log] = await testDb
			.select()
			.from(auditLog)
			.where(eq(auditLog.entityId, alice.id));
		expect(log.action).toBe('reservation.refund');
	});

	it('refuses an over-refund', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.refundParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			amount: 5000,
			actorId: actor.id,
		});
		expect(result).toEqual({
			ok: false,
			error: 'Le montant à rembourser dépasse le montant remboursable',
		});
		expect(stripe.createRefund).not.toHaveBeenCalled();
	});

	it('refuses without the permission and for another Day', async () => {
		const { event, alice, bobTomorrow, actor, dates } = await seed();
		const access = accessFor(WITHOUT_PERMISSION, dates);
		expect(
			await service.refundParty({
				access,
				eventId: event.id,
				reservationId: alice.id,
				amount: 100,
				actorId: actor.id,
			})
		).toEqual({ ok: false, error: expect.stringContaining('permission') });
		expect(
			await service.refundParty({
				access: accessFor(ADMIN, dates),
				eventId: event.id,
				reservationId: bobTomorrow.id,
				amount: 100,
				actorId: actor.id,
			})
		).toEqual({ ok: false, error: "Cette réservation n'est pas pour le jour en cours." });
	});
});

describe('withRefundInfo', () => {
	it('fills what was paid online, the refundable remainder and the policy’s suggestion', async () => {
		const { event, dates } = await seed();
		const access = accessFor(WITH_PERMISSION, dates);
		const dayGuestList = await import('../../src/lib/server/services/day-guest-list');
		const list = (await dayGuestList.getDayGuestList(access, event.id))!;
		expect(list).not.toBeNull();
		const annotated = await service.withRefundInfo(access, event.id, list, NOW);
		const alice = annotated.seatings.flatMap((s) => s.parties).find((p) => p.guestName === 'Alice')!;
		expect(alice.paidOnline).toBe(4000);
		expect(alice.refundable).toBe(4000);
		expect(alice.suggestedRefund).not.toBeNull();
		const walkIn = annotated.seatings.flatMap((s) => s.parties).find((p) => p.guestName === 'Walkin')!;
		expect(walkIn.paidOnline).toBe(0);
		expect(walkIn.refundable).toBe(0);
	});
});

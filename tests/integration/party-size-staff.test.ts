// @vitest-environment node
/**
 * Issue 048 — change a party's size from the Staff portal: the
 * `change_party` permission, the current Day of this Event, the over-pay
 * limit without `cancel_refund`, and the refund of the over-paid amount.
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
	createRefund: vi.fn(async (_paymentIntentId: string, amount?: number) => ({
		id: 're_test_mock',
		amount: amount ?? 0,
		status: 'succeeded',
	})),
}));

const notifications = vi.hoisted(() => ({
	sendReservationModifiedEmail: vi.fn().mockResolvedValue(undefined),
	sendRefundEmail: vi.fn().mockResolvedValue(undefined),
	sendRefundSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/email', () => ({
	sendReservationModifiedEmail: notifications.sendReservationModifiedEmail,
	sendRefundEmail: notifications.sendRefundEmail,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendRefundSMS: notifications.sendRefundSMS,
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

type Service = typeof import('../../src/lib/server/services/party-size');
type Stripe = typeof import('../../src/lib/server/services/stripe');
let service: Service;
let stripe: Stripe;

const ZONE = 'Europe/Paris';
const NOW = new Date('2026-06-06T12:00:00+02:00'); // un samedi, pendant le Jour

/** Who holds change_party (with or without cancel_refund), or neither. */
const WITH_PERMISSION: StaffWho = { kind: 'assignment', rolePermissions: ['change_party'] };
const WITH_REFUND: StaffWho = { kind: 'assignment', rolePermissions: ['change_party', 'cancel_refund'] };
const WITHOUT_PERMISSION: StaffWho = { kind: 'assignment', rolePermissions: ['settle_balance'] };

beforeEach(async () => {
	await setupTestDatabase();
	vi.clearAllMocks();
	if (!service) {
		service = await import('../../src/lib/server/services/party-size');
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
			availableCapacity: 18,
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

	// Alice : 2 personnes à 25,00, acompte de 40,00 payé en ligne, solde 10,00.
	async function reservation(sessionId: string, name: string) {
		const [reservation] = await testDb
			.insert(reservations)
			.values({
				eventSessionId: sessionId,
				guestName: name,
				guestEmail: `${name.toLowerCase()}@example.com`,
				quantity: 2,
				status: 'confirmed',
				totalAmount: 5000,
				depositAmount: 4000,
				balanceAmount: 1000,
				currency: 'EUR',
				accessToken: `tok_${crypto.randomUUID()}`,
				expiresAt: new Date(NOW.getTime() - 3600_000),
			})
			.returning();
		const [payment] = await testDb
			.insert(payments)
			.values({
				reservationId: reservation.id,
				stripePaymentIntentId: `pi_${reservation.id}`,
				idempotencyKey: `ik_${reservation.id}`,
				amount: 4000,
				refundedAmount: 0,
				status: 'succeeded',
				currency: 'EUR',
			})
			.returning();
		await testDb
			.update(reservations)
			.set({ paymentId: payment.id })
			.where(eq(reservations.id, reservation.id));
		return reservation;
	}

	const alice = await reservation(seating.id, 'Alice');
	const bobTomorrow = await reservation(seatingTomorrow.id, 'Bob');

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

	return { event, seating, alice, bobTomorrow, actor, dates: [today, tomorrow] };
}

function accessFor(who: StaffWho, dates: string[]) {
	return staffAccess(who, dates, ZONE, NOW);
}

describe('changeParty (staff)', () => {
	it('adds a Guest with the permission, during the Day, and records the audit entry', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.changeParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			quantity: 3,
			actorId: actor.id,
			now: NOW,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.quantity).toBe(3);
		expect(result.total).toBe(7500);
		expect(result.balance).toBe(3500);
		const [row] = await testDb
			.select({ quantity: reservations.quantity })
			.from(reservations)
			.where(eq(reservations.id, alice.id));
		expect(row.quantity).toBe(3);
		const [log] = await testDb.select().from(auditLog).where(eq(auditLog.entityId, alice.id));
		expect(log.action).toBe('reservation.change_guests');
		expect(stripe.createRefund).not.toHaveBeenCalled();
	});

	it('refuses without the permission', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.changeParty({
			access: accessFor(WITHOUT_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			quantity: 3,
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({ ok: false, error: expect.stringContaining('permission') });
	});

	it('refuses outside every Day window, even with the permission', async () => {
		const { event, alice, actor } = await seed();
		const result = await service.changeParty({
			access: accessFor(WITH_PERMISSION, []),
			eventId: event.id,
			reservationId: alice.id,
			quantity: 3,
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({ ok: false, error: expect.stringContaining('permission') });
	});

	it('refuses another Day’s Reservation', async () => {
		const { event, bobTomorrow, actor, dates } = await seed();
		const result = await service.changeParty({
			access: accessFor(WITH_REFUND, dates),
			eventId: event.id,
			reservationId: bobTomorrow.id,
			quantity: 3,
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({
			ok: false,
			error: "Cette réservation n'est pas pour le jour en cours.",
		});
	});

	it('limits a removal to the Balance without cancel_refund', async () => {
		const { event, alice, actor, dates } = await seed();
		// 1 personne : total 2500, solde épuisé, 1500 trop-perçus.
		const result = await service.changeParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			quantity: 1,
			refundAmount: 1500, // must be ignored: no cancel_refund
			actorId: actor.id,
			now: NOW,
		});
		expect(result).toEqual({
			ok: false,
			error: expect.stringContaining('« Annuler et rembourser »'),
		});
		expect(stripe.createRefund).not.toHaveBeenCalled();
	});

	it('refunds the over-paid amount with cancel_refund as well', async () => {
		const { event, alice, actor, dates } = await seed();
		const result = await service.changeParty({
			access: accessFor(WITH_REFUND, dates),
			eventId: event.id,
			reservationId: alice.id,
			quantity: 1,
			refundAmount: 1500,
			actorId: actor.id,
			now: NOW,
		});
		expect(result.ok).toBe(true);
		expect(result.ok && result.refunded).toBe(1500);
		expect(result.ok && result.balance).toBe(0);
		expect(stripe.createRefund).toHaveBeenCalledWith('pi_' + alice.id, 1500, expect.anything());
		const [row] = await testDb
			.select({ quantity: reservations.quantity, balance: reservations.balanceAmount })
			.from(reservations)
			.where(eq(reservations.id, alice.id));
		expect(row.quantity).toBe(1);
		expect(row.balance).toBe(0);
	});

	it('without cancel_refund a removal within the Balance goes through', async () => {
		const { event, alice, actor, dates } = await seed();
		// Total 8000, solde 3000, acompte 5000 — mais 4000 payés en ligne :
		// à 1 personne, total 4000, solde 0, rien de trop-perçu.
		await testDb
			.update(reservations)
			.set({ totalAmount: 8000, balanceAmount: 3000, depositAmount: 5000 })
			.where(eq(reservations.id, alice.id));
		const result = await service.changeParty({
			access: accessFor(WITH_PERMISSION, dates),
			eventId: event.id,
			reservationId: alice.id,
			quantity: 1,
			refundAmount: 1000, // must be ignored: no cancel_refund
			actorId: actor.id,
			now: NOW,
		});
		expect(result.ok).toBe(true);
		expect(result.ok && result.refunded).toBe(0);
		expect(stripe.createRefund).not.toHaveBeenCalled();
	});
});

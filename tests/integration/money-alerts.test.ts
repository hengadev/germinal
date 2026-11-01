// @vitest-environment node
//
// Issue 042 — « À traiter »: the refund_failed money alert appears for a
// cancelled Reservation whose Payment records a refused refund and isn't
// refunded up to the Deposit paid, and disappears once a refund succeeds
// (admin refund action / refund-after-cancellation, or the Stripe webhook).
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import { createRefund } from '../../src/lib/server/services/stripe';

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

type MoneyAlertsModule = typeof import('../../src/lib/server/services/money-alerts');
type CancellationEffectsModule = typeof import('../../src/lib/server/services/cancellation-effects');
type ReservationsModule = typeof import('../../src/lib/server/services/reservations');
type PaymentsModule = typeof import('../../src/lib/server/services/payments');

let moneyAlertsService: MoneyAlertsModule;
let cancellationEffects: CancellationEffectsModule;
let reservationsService: ReservationsModule;
let paymentsService: PaymentsModule;

beforeAll(async () => {
	moneyAlertsService = await import('../../src/lib/server/services/money-alerts');
	cancellationEffects = await import('../../src/lib/server/services/cancellation-effects');
	reservationsService = await import('../../src/lib/server/services/reservations');
	paymentsService = await import('../../src/lib/server/services/payments');
});

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	vi.clearAllMocks();
	vi.mocked(createRefund).mockImplementation(async (_paymentIntentId, amount) => ({
		id: 're_test_mock',
		amount: amount ?? 0,
		status: 'succeeded',
	}) as any);
	await setupTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const NOW = new Date('2099-06-01T08:00:00Z');

/** An Event and Seating; plus a cancelled Reservation whose Payment's refund
 *  was refused (lastError « Refund failed: … ») unless options say otherwise. */
async function seedReservation(options: {
	lastError?: string | null;
	refunded?: number;
	deposit?: number;
	reservationStatus?: string;
} = {}) {
	const deposit = options.deposit ?? 5000;
	const startTime = new Date(NOW.getTime() + 48 * HOUR);
	const endTime = new Date(startTime.getTime() + 3 * HOUR);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Alert Event',
			titleFr: 'Événement alerte',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: startTime,
			endDate: endTime,
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
		})
		.returning();

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, endTime),
			startTime,
			endTime,
			totalCapacity: 20,
			availableCapacity: 20,
			published: true,
		})
		.returning();

	const total = deposit + 3000;
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: session.id,
			guestEmail: 'guest@example.com',
			guestName: 'Test Guest',
			quantity: 2,
			totalAmount: total,
			depositAmount: deposit,
			balanceAmount: total - deposit,
			currency: 'EUR',
			status: options.reservationStatus ?? 'cancelled',
			accessToken: `atk-${Math.random().toString(36).slice(2)}`,
			expiresAt: new Date(NOW.getTime() + 15 * 60_000),
			confirmedAt: NOW,
		})
		.returning();

	const refunded = options.refunded ?? 0;
	const [payment] = await testDb
		.insert(payments)
		.values({
			reservationId: reservation.id,
			stripePaymentIntentId: `pi_test_${reservation.id}`,
			amount: deposit,
			refundedAmount: refunded,
			currency: 'EUR',
			status: refunded > 0 ? 'partially_refunded' : 'succeeded',
			lastError: options.lastError === undefined ? 'Refund failed: Card declined' : options.lastError,
			idempotencyKey: `ik-${reservation.id}`,
		})
		.returning();
	await testDb.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, reservation.id));
	return { reservation, payment, event, session };
}

async function alerts() {
	return moneyAlertsService.moneyAlerts(NOW);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

describe('refund_failed alerts', () => {
	it('lists a refused refund on a cancelled Reservation, with Stripe\'s error and the Reservation link', async () => {
		const { reservation, payment } = await seedReservation();
		const found = await alerts();
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			kind: 'refund_failed',
			reservationId: reservation.id,
			guestName: 'Test Guest',
			eventTitle: 'Événement alerte',
			amount: payment.amount,
			currency: 'EUR',
			detail: 'Refund failed: Card declined',
			href: `/admin/reservations/${reservation.id}`
		});
		expect(found[0].seatingStart).toBeInstanceOf(Date);
	});

	it('lists only the unrefunded remainder as the amount', async () => {
		await seedReservation({ refunded: 2000 });
		const found = await alerts();
		expect(found).toHaveLength(1);
		expect(found[0].amount).toBe(3000);
	});

	it('says nothing without the error, once fully refunded, or for a live Reservation', async () => {
		await seedReservation({ lastError: null });
		await seedReservation({ refunded: 5000 });
		await seedReservation({ reservationStatus: 'confirmed' });
		expect(await alerts()).toHaveLength(0);
	});

	it('lists a refused party-size refund on a confirmed Reservation, for what was paid beyond its Deposit (issue 047)', async () => {
		const { reservation } = await seedReservation({ reservationStatus: 'confirmed' });
		// Guests removed: the Reservation now keeps 3000 of the 5000 paid.
		await testDb.update(reservations).set({ quantity: 1, totalAmount: 3000, depositAmount: 3000, balanceAmount: 0 }).where(eq(reservations.id, reservation.id));
		const found = await alerts();
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ kind: 'refund_failed', reservationId: reservation.id, amount: 2000 });
	});

	it('counts by kind for the sidebar badge', async () => {
		await seedReservation();
		const counts = await moneyAlertsService.moneyAlertCounts(NOW);
		expect(counts).toEqual({ total: 1, byKind: { refund_failed: 1 } });
	});
});

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

describe('a successful refund clears the recorded failure', () => {
	it('refundAfterCancellation clears lastError and the alert', async () => {
		const { payment } = await seedReservation();
		const result = await cancellationEffects.refundAfterCancellation(
			{ id: payment.id, stripePaymentIntentId: payment.stripePaymentIntentId, currency: 'EUR', refundedAmount: 0 },
			payment.amount,
			`retry-${payment.id}`
		);
		expect(result).not.toBeNull();
		const after = await testDb.query.payments.findFirst({ where: eq(payments.id, payment.id) });
		expect(after?.lastError).toBeNull();
		expect(await alerts()).toHaveLength(0);
	});

	it('the admin refund action (processRefund) clears lastError and the alert', async () => {
		const { reservation, payment } = await seedReservation();
		await reservationsService.processRefund(reservation.id, payment.amount);
		const after = await testDb.query.payments.findFirst({ where: eq(payments.id, payment.id) });
		expect(after?.lastError).toBeNull();
		expect(await alerts()).toHaveLength(0);
	});

	it('the Stripe refund webhook (handleRefund) clears lastError and the alert', async () => {
		const { payment } = await seedReservation();
		await paymentsService.handleRefund({
			payment_intent: payment.stripePaymentIntentId,
			amount: payment.amount,
			amount_refunded: payment.amount,
		} as any);
		const after = await testDb.query.payments.findFirst({ where: eq(payments.id, payment.id) });
		expect(after?.lastError).toBeNull();
		expect(after?.refundedAmount).toBe(payment.amount);
		expect(await alerts()).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// balance_unsettled (issue 044)
// ---------------------------------------------------------------------------

import { checkIns, users } from '../../src/lib/server/db/schema';
import { dayOf, wallClockToInstant } from '../../src/lib/utils/event-time';

/** A Day ends at 6 a.m. the next morning (see staff access). */
const DAY_END_MINUTES = 6 * 60;

/**
 * A confirmed, non-Comp Reservation with a Balance, on a Seating whose
 * Day (in the Event's Time Zone) is `hoursAgo` old relative to NOW.
 */
async function seedParty(options: {
	timeZone?: string;
	hoursAgo?: number;
	checkInsGuests?: number[];
	status?: string;
	isComp?: boolean;
	balanceAmount?: number;
	settled?: boolean;
} = {}) {
	const timeZone = options.timeZone ?? 'America/New_York';
	const hoursAgo = options.hoursAgo ?? 48;
	const startTime = new Date(NOW.getTime() - hoursAgo * HOUR);
	const endTime = new Date(startTime.getTime() + 3 * HOUR);
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Arrived Event',
			titleFr: 'Événement arrivé',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: startTime,
			endDate: endTime,
			locationEn: 'Paris',
			locationFr: 'Paris',
			timeZone,
			visibility: 'public',
		})
		.returning();

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, endTime),
			startTime,
			endTime,
			totalCapacity: 20,
			availableCapacity: 20,
			published: true,
		})
		.returning();

	const balance = options.balanceAmount ?? 3000;
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: session.id,
			guestEmail: 'arrived@example.com',
			guestName: 'Arrived Guest',
			quantity: 4,
			totalAmount: 5000 + balance,
			depositAmount: 5000,
			balanceAmount: balance,
			currency: 'EUR',
			status: options.status ?? 'confirmed',
			isComp: options.isComp ?? false,
			accessToken: `atk-${Math.random().toString(36).slice(2)}`,
			expiresAt: new Date(NOW.getTime() + 15 * 60_000),
			confirmedAt: NOW,
			balanceSettledAt: options.settled ? NOW : null,
		})
		.returning();

	for (const guests of options.checkInsGuests ?? [2]) {
		await testDb.insert(checkIns).values({
			reservationId: reservation.id,
			guests,
			method: 'manual',
			checkedInAt: startTime
		});
	}
	return { reservation, event, session, startTime };
}

describe('balance_unsettled alerts', () => {
	it('lists an arrived party with an unsettled Balance once its Day is over', async () => {
		const { reservation } = await seedParty();
		const found = await alerts();
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			kind: 'balance_unsettled',
			reservationId: reservation.id,
			guestName: 'Arrived Guest',
			eventTitle: 'Événement arrivé',
			amount: 3000,
			currency: 'EUR',
			detail: '2 / 4 arrivés',
			href: `/admin/reservations/${reservation.id}`
		});
	});

	it('appears exactly at 6 a.m. the next morning in the Event’s Time Zone, not a minute before', async () => {
		const { startTime } = await seedParty();
		const day = dayOf(startTime, 'America/New_York');
		const dayEnd = wallClockToInstant(day, DAY_END_MINUTES + 24 * 60, 'America/New_York');
		expect(await moneyAlertsService.moneyAlerts(new Date(dayEnd.getTime() - 60_000))).toHaveLength(0);
		expect(await moneyAlertsService.moneyAlerts(dayEnd)).toHaveLength(1);
	});

	it('says nothing for a Day still under way (far Time Zone)', async () => {
		// 12 hours ago in Auckland: the Seating’s Day ends after NOW.
		await seedParty({ timeZone: 'Pacific/Auckland', hoursAgo: 12 });
		expect(await alerts()).toHaveLength(0);
	});

	it('says nothing with no Check-in, for a Comp, a zero Balance, a settled Balance, or a Seating over 30 days old', async () => {
		await seedParty({ checkInsGuests: [] });
		await seedParty({ isComp: true });
		await seedParty({ balanceAmount: 0 });
		await seedParty({ settled: true });
		await seedParty({ hoursAgo: 40 * 24 });
		expect(await alerts()).toHaveLength(0);
	});

	it('an undone Check-in alone does not count as arrived', async () => {
		const { reservation } = await seedParty();
		await testDb
			.update(checkIns)
			.set({ undoneAt: NOW })
			.where(eq(checkIns.reservationId, reservation.id));
		expect(await alerts()).toHaveLength(0);
	});

	it('marking the Balance settled, from Admin or the Staff portal, removes the alert', async () => {
		const { reservation, event } = await seedParty();
	const [staffUser] = await testDb
		.insert(users)
		.values({
			email: `staff-${Math.random().toString(36).slice(2)}@example.com`,
			firstName: 'Staff',
			lastName: 'Test',
			passwordHash: 'x'
		})
		.returning();

		const balance = await import('../../src/lib/server/services/balance');
		// The Staff portal’s action: every permission, the Day of the Seating.
		const staffDay = dayOf(new Date(NOW.getTime() - 48 * HOUR), 'America/New_York');
		const staffResult = await balance.settleBalance({
			access: { can: () => true, day: staffDay } as any,
			eventId: event.id,
			reservationId: reservation.id,
			actorId: staffUser.id
		});
		expect(staffResult.ok).toBe(true);
		expect(await alerts()).toHaveLength(0);

		// Undo, then settle from Admin (issue 044).
		await testDb
			.update(reservations)
			.set({ balanceSettledAt: null, balanceSettledBy: null })
			.where(eq(reservations.id, reservation.id));
		expect(await alerts()).toHaveLength(1);
		const adminResult = await balance.settleBalanceAsAdmin({
			reservationId: reservation.id,
			actorId: staffUser.id
		});
		expect(adminResult.ok).toBe(true);
		expect(await alerts()).toHaveLength(0);
	});
});

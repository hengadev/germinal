// @vitest-environment node
//
// Issue 068 — choosing Extras at booking: they are priced into the total
// (all three Deposit rules), the stock is refused when sold out, never
// oversold by concurrent bookings, kept through a party-size change, and
// an Admin quantity change re-prices the Balance only.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { eventExtras, events, eventSessions, payments, reservations, users } from '../../src/lib/server/db/schema';

const ACTOR_ID = '00000000-0000-0000-0000-000000000001';
const seedActor = async () =>
	await testDb.insert(users).values({
		id: ACTOR_ID,
		email: 'admin@example.com',
		firstName: 'Admin',
		lastName: 'Test',
		passwordHash: 'x',
		role: 'admin',
	}).onConflictDoNothing();
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockImplementation(() =>
		Promise.resolve({
			id: `cs_test_mock_checkout_session_${crypto.randomUUID()}`,
			url: 'https://checkout.stripe.test/mock',
		})
	),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
	createRefund: vi.fn(async (_paymentIntentId: string, amount?: number) => ({
		id: 're_test_mock',
		amount: amount ?? 0,
		status: 'succeeded',
	})),
}));

vi.mock('../../src/lib/server/services/ticket-notifications', () => ({
	sendTicketNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/email', () => ({
	sendRefundEmail: vi.fn().mockResolvedValue(undefined),
	sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
	sendReservationModifiedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendRefundSMS: vi.fn().mockResolvedValue(undefined),
	sendCancellationSMS: vi.fn().mockResolvedValue(undefined),
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

type ReservationsModule = typeof import('../../src/lib/server/services/reservations');
type ExtrasModule = typeof import('../../src/lib/server/services/event-extras');
type TransitionsModule = typeof import('../../src/lib/server/services/reservation-transitions');
type PartySizeModule = typeof import('../../src/lib/server/services/party-size');
let svc: ReservationsModule;
let extras: ExtrasModule;
let transitions: TransitionsModule;
let partySize: PartySizeModule;

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	vi.clearAllMocks();
	svc = await import('../../src/lib/server/services/reservations');
	extras = await import('../../src/lib/server/services/event-extras');
	transitions = await import('../../src/lib/server/services/reservation-transitions');
	partySize = await import('../../src/lib/server/services/party-size');
	await setupTestDatabase();
	await seedActor();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A published Event with the given Deposit rule, one Seating at €50 a
 * seat, and the given Extras. */
async function seedSession(
	deposit: { depositType: 'none' | 'fixed' | 'percent'; depositValue: number },
	extraRows: { nameFr?: string; nameEn?: string; priceAmount?: number; unit?: 'per_person' | 'per_unit'; stock?: number | null }[] = []
) {
	const startTime = new Date('2099-06-01T18:00:00Z');
	const endTime = new Date('2099-06-01T22:00:00Z');
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Extras Event',
			titleFr: 'Événement suppléments',
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Paris',
			locationFr: 'Paris',
			visibility: 'public',
			...deposit,
		})
		.returning();

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, endTime, { priceAmount: 5000 }),
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime,
			endTime,
			totalCapacity: 100,
			availableCapacity: 100,
			published: true,
		})
		.returning();

	const created = await testDb
		.insert(eventExtras)
		.values(extraRows.map((row, index) => ({
			eventId: event.id,
			nameEn: row.nameEn ?? 'Wine pairing',
			nameFr: row.nameFr ?? 'Accord mets-vins',
			priceAmount: row.priceAmount ?? 1500,
			unit: row.unit ?? 'per_unit',
			stock: row.stock === undefined ? null : row.stock,
			position: index,
		})))
		.returning();

	return { event, session, created };
}

function makeInput(sessionId: string, quantity = 1, chosen: { extraId: string; quantity: number }[] = []) {
	return {
		sessionId,
		email: 'guest@example.com',
		name: 'Test Guest',
		quantity,
		extras: chosen,
	};
}

/** Confirm a pending Reservation the way the paid webhook does. */
async function confirmPayment(reservationId: string) {
	const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, reservationId));
	const outcome = await transitions.confirmReservationForPayment({
		reservationId,
		paymentId: payment.id,
		paymentIntentId: `pi_test_${reservationId}`,
	});
	expect(outcome.won).toBe(true);
	await testDb.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, reservationId));
	return payment;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReservation with extras', () => {
	it('prices extras into the total under a fixed Deposit (per seat unchanged)', async () => {
		const { session, created } = await seedSession({ depositType: 'fixed', depositValue: 2000 }, [
			{ priceAmount: 1500, unit: 'per_unit', stock: 10 },
		]);

		const result = await svc.createReservation(makeInput(session.id, 2, [{ extraId: created[0].id, quantity: 3 }]));

		// 2 × €50 + 3 × €15 = €145; Deposit 2 × €20 = €40.
		expect(result.reservation.totalAmount).toBe(14500);
		expect(result.reservation.depositAmount).toBe(4000);
		expect(result.reservation.balanceAmount).toBe(10500);
		const snapshots = await extras.loadReservationExtras(result.reservation.id);
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]).toMatchObject({ eventExtraId: created[0].id, unitPrice: 1500, unit: 'per_unit', quantity: 3 });
		// Stripe charges the Deposit.
		expect(result.checkoutUrl).toBe('https://checkout.stripe.test/mock');
		const [payment] = await testDb.select().from(payments).where(eq(payments.reservationId, result.reservation.id));
		expect(payment.amount).toBe(4000);
	});

	it('a percentage Deposit covers the extras; none leaves it all on the Balance', async () => {
		const percent = await seedSession({ depositType: 'percent', depositValue: 50 }, [
			{ priceAmount: 1500, unit: 'per_unit', stock: 10 },
		]);
		const a = await svc.createReservation(makeInput(percent.session.id, 2, [{ extraId: percent.created[0].id, quantity: 2 }]));
		// Total €130, Deposit €65.
		expect(a.reservation.totalAmount).toBe(13000);
		expect(a.reservation.depositAmount).toBe(6500);
		expect(a.reservation.balanceAmount).toBe(6500);

		const none = await seedSession({ depositType: 'none', depositValue: 0 }, [
			{ priceAmount: 1500, unit: 'per_unit', stock: 10 },
		]);
		const b = await svc.createReservation(makeInput(none.session.id, 2, [{ extraId: none.created[0].id, quantity: 2 }]));
		// Confirmed at once, nothing online, extras in the Balance.
		expect(b.reservation.status).toBe('confirmed');
		expect(b.reservation.totalAmount).toBe(13000);
		expect(b.reservation.depositAmount).toBe(0);
		expect(b.reservation.balanceAmount).toBe(13000);
	});

	it('a per-person extra takes the party size, ignoring the client quantity', async () => {
		const { session, created } = await seedSession({ depositType: 'percent', depositValue: 100 }, [
			{ priceAmount: 2000, unit: 'per_person', stock: null },
		]);

		const result = await svc.createReservation(makeInput(session.id, 3, [{ extraId: created[0].id, quantity: 1 }]));

		const snapshots = await extras.loadReservationExtras(result.reservation.id);
		expect(snapshots[0].quantity).toBe(3);
		expect(result.reservation.totalAmount).toBe(3 * 5000 + 3 * 2000);
	});

	it('refuses a sold-out extra with its name, and books nothing', async () => {
		const { session, created } = await seedSession({ depositType: 'percent', depositValue: 100 }, [
			{ priceAmount: 1500, stock: 2 },
		]);

		await expect(svc.createReservation(makeInput(session.id, 1, [{ extraId: created[0].id, quantity: 2 }])))
			.resolves.toBeDefined();
		await expect(svc.createReservation(makeInput(session.id, 1, [{ extraId: created[0].id, quantity: 1 }])))
			.rejects.toMatchObject({ name: 'ExtraSoldOutError' });

		const booked = await testDb.select().from(reservations);
		expect(booked).toHaveLength(1);
	});

	it('two concurrent bookings never oversell the last unit', async () => {
		const { session, created } = await seedSession({ depositType: 'percent', depositValue: 100 }, [
			{ priceAmount: 1500, stock: 1 },
		]);

		const results = await Promise.allSettled([
			svc.createReservation(makeInput(session.id, 1, [{ extraId: created[0].id, quantity: 1 }])),
			svc.createReservation(makeInput(session.id, 1, [{ extraId: created[0].id, quantity: 1 }])),
		]);
		const won = results.filter((r) => r.status === 'fulfilled');
		const lost = results.filter((r) => r.status === 'rejected');
		expect(won).toHaveLength(1);
		expect(lost).toHaveLength(1);
		expect((lost[0] as PromiseRejectedResult).reason.name).toBe('ExtraSoldOutError');
	});

	it('a party-size change keeps the extras total (per-person keeps its quantity)', async () => {
		const { session, created } = await seedSession({ depositType: 'fixed', depositValue: 2000 }, [
			{ priceAmount: 1500, unit: 'per_unit', stock: 10 },
		]);

		const result = await svc.createReservation(makeInput(session.id, 2, [{ extraId: created[0].id, quantity: 2 }]));
		await confirmPayment(result.reservation.id);
		// Total €130 = €100 meal + €30 extras; Deposit paid €40.

		const change = await partySize.changeGuests({
			reservationId: result.reservation.id,
			quantity: 4,
			actorId: ACTOR_ID,
		});
		expect(change.ok).toBe(true);
		if (!change.ok) return;
		// Meal scales to €200, extras stay €30: total €230, Balance €190.
		expect(change.total).toBe(23000);
		expect(change.balance).toBe(19000);

		const snapshots = await extras.loadReservationExtras(result.reservation.id);
		expect(snapshots[0].quantity).toBe(2);
	});

	it('an Admin quantity change re-prices the Balance only', async () => {
		const { session, created } = await seedSession({ depositType: 'fixed', depositValue: 2000 }, [
			{ priceAmount: 1500, unit: 'per_unit', stock: 10 },
		]);

		const result = await svc.createReservation(makeInput(session.id, 2, [{ extraId: created[0].id, quantity: 2 }]));
		await confirmPayment(result.reservation.id);
		// Total €130, Deposit paid €40, Balance €90.

		const change = await extras.changeReservationExtras({
			reservationId: result.reservation.id,
			quantities: [{ extraId: created[0].id, quantity: 4 }],
			actorId: ACTOR_ID,
		});
		expect(change.ok).toBe(true);
		if (!change.ok) return;
		// Extras €30 → €60: total €160, Deposit unchanged €40, Balance €120.
		expect(change.total).toBe(16000);
		expect(change.balance).toBe(12000);

		const [row] = await testDb.select().from(reservations).where(eq(reservations.id, result.reservation.id));
		expect(row.totalAmount).toBe(16000);
		expect(row.depositAmount).toBe(4000);
		expect(row.balanceAmount).toBe(12000);
		const snapshots = await extras.loadReservationExtras(result.reservation.id);
		expect(snapshots[0].quantity).toBe(4);
	});
});

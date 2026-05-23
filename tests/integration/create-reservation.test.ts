// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations, payments } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';
import type { CreateReservationInput } from '../../src/lib/types/reservations';

// ---------------------------------------------------------------------------
// Single postgres client shared between the mocked db and test assertions.
// Using the fixture singleton avoids leaking connections.
// ---------------------------------------------------------------------------

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
//
// 1. Stripe — mocked at the service boundary so no real HTTP calls happen.
// 2. db    — the lazy singleton in src/lib/server/db/index.ts is replaced with
//            the fixture's test-scoped drizzle instance backed by germinal_test.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/server/services/stripe', () => ({
	createCheckoutSession: vi.fn().mockResolvedValue({
		id: 'cs_test_mock_checkout_session',
		url: 'https://checkout.stripe.test/mock',
	}),
	cancelCheckoutSession: vi.fn().mockResolvedValue(undefined),
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
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

afterAll(async () => {
	await closeTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedPublishedSession(overrides?: Partial<typeof eventSessions.$inferInsert>) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Test Event',
			titleFr: 'Événement Test',
			slug: `test-event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			descriptionEn: 'Test description',
			descriptionFr: 'Description test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Test Location',
			locationFr: 'Lieu Test',
			published: true,
		})
		.returning();

	const defaultStart = new Date('2099-06-01T18:00:00Z');
	const defaultEnd = new Date('2099-06-01T22:00:00Z');

	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime: defaultStart,
			endTime: defaultEnd,
			totalCapacity: 100,
			availableCapacity: 100,
			priceAmount: 2500, // €25.00
			currency: 'EUR',
			published: true,
			...overrides,
		})
		.returning();

	return { event, session };
}

function makeInput(
	sessionId: string,
	overrides?: Partial<CreateReservationInput>
): CreateReservationInput {
	return {
		sessionId,
		email: 'guest@example.com',
		name: 'Test Guest',
		quantity: 1,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReservation', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — creates reservation, payment, decrements capacity, returns checkoutUrl', async () => {
		const { session } = await seedPublishedSession();
		const input = makeInput(session.id, { quantity: 2 });

		// Dynamic import so module-level mocks are in place before evaluation
		const { createReservation } = await import('../../src/lib/server/services/reservations');

		const result = await createReservation(input);

		// --- Return value checks ---
		expect(result.reservation).toBeDefined();
		expect(result.checkoutUrl).toBe('https://checkout.stripe.test/mock');
		expect(result.expiresAt).toBeInstanceOf(Date);

		// --- Reservation row ---
		const [reservation] = await testDb
			.select()
			.from(reservations)
			.where(eq(reservations.id, result.reservation.id));
		expect(reservation).toBeDefined();
		expect(reservation.status).toBe('pending');
		expect(reservation.quantity).toBe(2);
		expect(reservation.totalAmount).toBe(5000); // 2500 × 2
		expect(reservation.guestEmail).toBe('guest@example.com');

		// --- Payment row ---
		const [payment] = await testDb
			.select()
			.from(payments)
			.where(eq(payments.reservationId, result.reservation.id));
		expect(payment).toBeDefined();
		expect(payment.status).toBe('pending');
		expect(payment.amount).toBe(5000);

		// --- Capacity decremented ---
		const [updatedSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(updatedSession.availableCapacity).toBe(98); // 100 − 2
	});

	it('sold out — throws when availableCapacity < quantity; capacity unchanged', async () => {
		const { session } = await seedPublishedSession({
			totalCapacity: 5,
			availableCapacity: 1,
		});
		const input = makeInput(session.id, { quantity: 2 });

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow('Not enough tickets available');

		// Capacity should remain unchanged
		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(1);

		// No reservation should exist
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);
	});

	it('race condition — two concurrent calls for the last ticket; exactly one succeeds', async () => {
		const { session } = await seedPublishedSession({
			totalCapacity: 1,
			availableCapacity: 1,
		});

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		const input1 = makeInput(session.id, { email: 'guest1@example.com', name: 'Guest 1', quantity: 1 });
		const input2 = makeInput(session.id, { email: 'guest2@example.com', name: 'Guest 2', quantity: 1 });

		const results = await Promise.allSettled([
			createReservation(input1),
			createReservation(input2),
		]);

		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected');

		// Exactly one succeeds, one fails
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);

		// Capacity should be non-negative
		const [finalSession] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(finalSession.availableCapacity).toBeGreaterThanOrEqual(0);

		// Exactly one reservation was created
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(1);
	});

	it('session not published — throws when published flag is false', async () => {
		const { session } = await seedPublishedSession({ published: false });
		const input = makeInput(session.id);

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow('Session not found or not published');

		// No reservation created
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);
	});

	it('session already started — throws when startTime is in the past', async () => {
		const { session } = await seedPublishedSession({
			startTime: new Date('2020-01-01T10:00:00Z'),
			endTime: new Date('2020-01-01T14:00:00Z'),
		});
		const input = makeInput(session.id);

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow(
			'Cannot book tickets for a session that has already started'
		);

		// No reservation created
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);
	});

	it('honeypot filled — throws when honeypot field is non-empty', async () => {
		const { session } = await seedPublishedSession();
		const input = makeInput(session.id, { honeypot: 'bot-fill' });

		const { createReservation } = await import('../../src/lib/server/services/reservations');

		await expect(createReservation(input)).rejects.toThrow('Invalid submission');

		// No reservation created, capacity unchanged
		const allReservations = await testDb.select().from(reservations);
		expect(allReservations).toHaveLength(0);

		const [unchanged] = await testDb
			.select()
			.from(eventSessions)
			.where(eq(eventSessions.id, session.id));
		expect(unchanged.availableCapacity).toBe(100);
	});
});

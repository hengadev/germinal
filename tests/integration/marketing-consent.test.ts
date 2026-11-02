// @vitest-environment node
//
// Issue 052 — marketing consent at booking. A Guest who ticks « Hear about
// Germinal's next events » is subscribed and confirmed at once when their
// Reservation is confirmed (paid, or confirmed without payment); never
// otherwise. Unsubscribe is by token, the export carries confirmed
// subscribed rows only, and the purge drops unsubscribed rows after 30
// days. Integration tests against a real test database.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { events, eventSessions, reservations, payments, subscribers } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	seedServiceForSession,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/services/email', () => ({
	sendTicketConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/server/services/ticket-notifications', () => ({
	sendTicketNotifications: vi.fn().mockResolvedValue(undefined),
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

const { createReservation } = await import('../../src/lib/server/services/reservations');
const { confirmReservationForPayment } = await import(
	'../../src/lib/server/services/reservation-transitions'
);
const { unsubscribeByToken } = await import('../../src/lib/server/services/subscribers');
const { exportSubscribersToCSV } = await import('../../src/lib/server/services/export');
const { purgePersonalData } = await import('../../src/lib/server/jobs/purge-personal-data');

const DAY = 24 * 60 * 60 * 1000;

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	await setupTestDatabase();
});

async function seedPublishedSession(priceAmount = 2500) {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Consent Test Event',
			titleFr: 'Événement Test Consentement',
			descriptionEn: 'Test description',
			descriptionFr: 'Description test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Test Location',
			locationFr: 'Lieu Test',
			visibility: 'public',
			depositType: 'none',
			depositValue: 0,
		})
		.returning();

	const startTime = new Date('2099-06-01T18:00:00Z');
	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId: event.id,
			serviceId: await seedServiceForSession(testDb, event.id, startTime, new Date('2099-06-01T22:00:00Z'), { priceAmount }),
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime,
			endTime: new Date('2099-06-01T22:00:00Z'),
			totalCapacity: 100,
			availableCapacity: 100,
			published: true,
		})
		.returning();

	return { event, session };
}

let tokenSeq = 0;

/** A pending Reservation with a pending payment, as booking leaves it. */
async function seedPendingReservation(
	sessionId: string,
	overrides: Partial<typeof reservations.$inferInsert> = {}
) {
	tokenSeq += 1;
	const [reservation] = await testDb
		.insert(reservations)
		.values({
			eventSessionId: sessionId,
			guestEmail: 'Guest@Example.com ',
			guestName: 'Consent Guest',
			quantity: 2,
			totalAmount: 5000,
			depositAmount: 5000,
			balanceAmount: 0,
			currency: 'EUR',
			status: 'pending',
			locale: 'fr',
			accessToken: `test-atk-mc-${Date.now()}-${tokenSeq}`,
			expiresAt: new Date(Date.now() + 15 * 60 * 1000),
			...overrides,
		})
		.returning();

	const [payment] = await testDb
		.insert(payments)
		.values({
			reservationId: reservation.id,
			stripePaymentIntentId: `cs_test_${reservation.id}`,
			amount: 5000,
			currency: 'EUR',
			status: 'pending',
			idempotencyKey: `test-ik-mc-${reservation.id}`,
		})
		.returning();

	await testDb.update(reservations).set({ paymentId: payment.id }).where(eq(reservations.id, reservation.id));
	return { reservation, payment };
}

async function subscriberByEmail(email: string) {
	const [row] = await testDb.select().from(subscribers).where(eq(subscribers.email, email));
	return row ?? null;
}

describe('marketing consent at booking (issue 052)', () => {
	it('confirming a paid Reservation with the box ticked subscribes and confirms at once', async () => {
		const { session } = await seedPublishedSession();
		const { reservation, payment } = await seedPendingReservation(session.id, {
			marketingConsent: true,
		});

		const outcome = await confirmReservationForPayment({
			reservationId: reservation.id,
			paymentId: payment.id,
			paymentIntentId: 'pi_test_1',
		});

		expect(outcome.won).toBe(true);
		// The email is normalised (lower-cased, trimmed).
		const row = await subscriberByEmail('guest@example.com');
		expect(row).not.toBeNull();
		expect(row!.source).toBe('booking');
		expect(row!.locale).toBe('fr');
		expect(row!.confirmedAt).not.toBeNull();
		expect(row!.unsubscribedAt).toBeNull();
		expect(row!.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
		expect(row!.confirmationToken).toMatch(/^[0-9a-f]{64}$/);
	});

	it('a Reservation made without the box never subscribes', async () => {
		const { session } = await seedPublishedSession();
		const { reservation, payment } = await seedPendingReservation(session.id, {
			marketingConsent: false,
		});

		const outcome = await confirmReservationForPayment({
			reservationId: reservation.id,
			paymentId: payment.id,
			paymentIntentId: 'pi_test_2',
		});

		expect(outcome.won).toBe(true);
		expect(await subscriberByEmail('guest@example.com')).toBeNull();
	});

	it('an expired Reservation never subscribes', async () => {
		const { session } = await seedPublishedSession();
		const { reservation, payment } = await seedPendingReservation(session.id, {
			marketingConsent: true,
			status: 'expired',
		});

		const outcome = await confirmReservationForPayment({
			reservationId: reservation.id,
			paymentId: payment.id,
			paymentIntentId: 'pi_test_3',
		});

		expect(outcome.won).toBe(false);
		expect(await subscriberByEmail('guest@example.com')).toBeNull();
	});

	it('a Reservation confirmed without payment subscribes at once', async () => {
		const { session } = await seedPublishedSession(0); // no deposit to collect

		const result = await createReservation({
			sessionId: session.id,
			email: 'Free@Example.com',
			name: 'Free Guest',
			quantity: 1,
			notificationPreference: 'email',
			locale: 'en',
			marketingConsent: true,
			honeypot: '',
		});

		expect(result.reservation.status).toBe('confirmed');
		const row = await subscriberByEmail('free@example.com');
		expect(row).not.toBeNull();
		expect(row!.confirmedAt).not.toBeNull();
		expect(row!.unsubscribedAt).toBeNull();
	});

	it('ticking the box again after an unsubscribe re-subscribes with fresh dates', async () => {
		const { session } = await seedPublishedSession();
		const first = await seedPendingReservation(session.id, { marketingConsent: true });
		await confirmReservationForPayment({
			reservationId: first.reservation.id,
			paymentId: first.payment.id,
			paymentIntentId: 'pi_test_4',
		});
		const subscribed = (await subscriberByEmail('guest@example.com'))!;

		expect(await unsubscribeByToken(subscribed.unsubscribeToken)).toBe(true);
		expect((await subscriberByEmail('guest@example.com'))!.unsubscribedAt).not.toBeNull();

		const second = await seedPendingReservation(session.id, { marketingConsent: true });
		await confirmReservationForPayment({
			reservationId: second.reservation.id,
			paymentId: second.payment.id,
			paymentIntentId: 'pi_test_5',
		});

		const again = (await subscriberByEmail('guest@example.com'))!;
		expect(again.unsubscribedAt).toBeNull();
		expect(again.confirmedAt!.getTime()).toBeGreaterThan(subscribed.confirmedAt!.getTime());
		expect(again.unsubscribeToken).not.toBe(subscribed.unsubscribeToken);
	});

	it('a second confirmed booking by an already-subscribed Guest changes nothing', async () => {
		const { session } = await seedPublishedSession();
		const first = await seedPendingReservation(session.id, { marketingConsent: true });
		await confirmReservationForPayment({
			reservationId: first.reservation.id,
			paymentId: first.payment.id,
			paymentIntentId: 'pi_test_6',
		});
		const original = (await subscriberByEmail('guest@example.com'))!;

		const second = await seedPendingReservation(session.id, { marketingConsent: true });
		await confirmReservationForPayment({
			reservationId: second.reservation.id,
			paymentId: second.payment.id,
			paymentIntentId: 'pi_test_7',
		});

		const unchanged = (await subscriberByEmail('guest@example.com'))!;
		expect(unchanged.consentAt).toEqual(original.consentAt);
		expect(unchanged.unsubscribeToken).toBe(original.unsubscribeToken);
	});

	it('unsubscribes by token in one step, and an unknown token does nothing', async () => {
		const { session } = await seedPublishedSession();
		const { reservation, payment } = await seedPendingReservation(session.id, {
			marketingConsent: true,
		});
		await confirmReservationForPayment({
			reservationId: reservation.id,
			paymentId: payment.id,
			paymentIntentId: 'pi_test_8',
		});
		const row = (await subscriberByEmail('guest@example.com'))!;

		// Following the link twice unsubscribes once.
		expect(await unsubscribeByToken(row.unsubscribeToken)).toBe(true);
		expect(await unsubscribeByToken(row.unsubscribeToken)).toBe(false);
		expect((await subscriberByEmail('guest@example.com'))!.unsubscribedAt).not.toBeNull();
		expect(await unsubscribeByToken('0'.repeat(64))).toBe(false);
	});

	it('exports only confirmed, subscribed rows, with a BOM', async () => {
		const { session } = await seedPublishedSession();

		const subscribed = await seedPendingReservation(session.id, {
			marketingConsent: true,
			guestEmail: 'on-list@example.com',
		});
		await confirmReservationForPayment({
			reservationId: subscribed.reservation.id,
			paymentId: subscribed.payment.id,
			paymentIntentId: 'pi_test_9',
		});

		const offList = await seedPendingReservation(session.id, {
			marketingConsent: true,
			guestEmail: 'off-list@example.com',
		});
		await confirmReservationForPayment({
			reservationId: offList.reservation.id,
			paymentId: offList.payment.id,
			paymentIntentId: 'pi_test_10',
		});
		await unsubscribeByToken(
			(await subscriberByEmail('off-list@example.com'))!.unsubscribeToken
		);

		const csv = await exportSubscribersToCSV();
		expect(csv.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
		expect(csv).toContain('on-list@example.com');
		expect(csv).not.toContain('off-list@example.com');
		expect(csv).toContain('Email,Name,Language,Source,Consent Date,Confirmation Date,Unsubscribe URL');
		const token = (await subscriberByEmail('on-list@example.com'))!.unsubscribeToken;
		expect(csv).toContain(`/unsubscribe?token=${token}`);
	});

	it('an unconfirmed row is never on the list nor exported', async () => {
		await testDb.insert(subscribers).values({
			email: 'pending@example.com',
			source: 'form',
			consentAt: new Date(),
			confirmationToken: 'p'.repeat(64),
			unsubscribeToken: 'q'.repeat(64),
		});
		expect(await exportSubscribersToCSV()).not.toContain('pending@example.com');
	});

	it('the purge deletes unsubscribed rows 30 days after the unsubscribe, and only those', async () => {
		const now = new Date('2030-01-01T12:00:00Z');
		await testDb.insert(subscribers).values([
			{
				email: 'old-unsub@example.com',
				name: 'Old Unsub',
				locale: 'fr',
				source: 'booking',
				consentAt: new Date(now.getTime() - 40 * DAY),
				confirmedAt: new Date(now.getTime() - 40 * DAY),
				unsubscribedAt: new Date(now.getTime() - 31 * DAY),
				confirmationToken: 'a'.repeat(64),
				unsubscribeToken: 'b'.repeat(64),
			},
			{
				email: 'recent-unsub@example.com',
				name: 'Recent Unsub',
				locale: 'en',
				source: 'booking',
				consentAt: new Date(now.getTime() - 40 * DAY),
				confirmedAt: new Date(now.getTime() - 40 * DAY),
				unsubscribedAt: new Date(now.getTime() - 10 * DAY),
				confirmationToken: 'c'.repeat(64),
				unsubscribeToken: 'd'.repeat(64),
			},
			{
				email: 'still-on@example.com',
				name: 'Still On',
				locale: 'fr',
				source: 'booking',
				consentAt: new Date(now.getTime() - 90 * DAY),
				confirmedAt: new Date(now.getTime() - 90 * DAY),
				confirmationToken: 'e'.repeat(64),
				unsubscribeToken: 'f'.repeat(64),
			},
		]);

		const result = await purgePersonalData(now);

		expect(result.subscribersDeleted).toBe(1);
		expect(await subscriberByEmail('old-unsub@example.com')).toBeNull();
		expect(await subscriberByEmail('recent-unsub@example.com')).not.toBeNull();
		expect(await subscriberByEmail('still-on@example.com')).not.toBeNull();
	});
});

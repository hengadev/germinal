// @vitest-environment node
//
// Issue 064 — a gift card Checkout Session issues its card exactly once,
// even on a repeated webhook delivery or two concurrent ones, and unpaid
// or failed sessions issue nothing. Integration test against a real test
// database; email mocked (prior art: checkout-confirmation.test.ts).
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { giftCards } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

const sendGiftCardEmailMock = vi.fn().mockResolvedValue(undefined);
const sendGiftCardReceiptEmailMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/lib/server/services/email', () => ({
	sendGiftCardEmail: sendGiftCardEmailMock,
	sendGiftCardReceiptEmail: sendGiftCardReceiptEmailMock,
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
	isStripeEnabled: () => true,
	isAWSConfigured: () => false,
	isBrevoConfigured: () => false,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

function giftCardSession(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: 'cs_gift_test_1',
		payment_status: 'paid',
		metadata: {
			kind: 'gift_card',
			amount: '7500',
			buyerName: 'Marie Dupont',
			buyerEmail: 'marie@example.com',
			recipientName: 'Jean Martin',
			recipientEmail: 'jean@example.com',
			message: 'Joyeux anniversaire !',
			delivery: 'recipient',
			locale: 'fr',
		},
		...overrides,
	} as any;
}

let handleCheckoutSuccess: Awaited<
	typeof import('../../src/lib/server/services/payments')
>['handleCheckoutSuccess'];
let handleAsyncPaymentFailed: Awaited<
	typeof import('../../src/lib/server/services/payments')
>['handleAsyncPaymentFailed'];

beforeAll(async () => {
	const mod = await import('../../src/lib/server/services/payments');
	handleCheckoutSuccess = mod.handleCheckoutSuccess;
	handleAsyncPaymentFailed = mod.handleAsyncPaymentFailed;
});

beforeEach(async () => {
	await setupTestDatabase();
	sendGiftCardEmailMock.mockClear();
	sendGiftCardReceiptEmailMock.mockClear();
});

afterAll(async () => {
	await closeTestDatabase();
});

async function cardsBySession(sessionId: string) {
	return testDb
		.select()
		.from(giftCards)
		.where(eq(giftCards.stripeReference, sessionId));
}

describe('gift card checkout webhook (issue 064)', () => {
	it('issues one card and queues the card email to the recipient and a receipt to the buyer', async () => {
		await handleCheckoutSuccess(giftCardSession());

		const cards = await cardsBySession('cs_gift_test_1');
		expect(cards).toHaveLength(1);
		expect(cards[0].initialAmount).toBe(7500);
		expect(cards[0].origin).toBe('online');
		expect(cards[0].status).toBe('active');

		expect(sendGiftCardEmailMock).toHaveBeenCalledTimes(1);
		expect(sendGiftCardEmailMock.mock.calls[0][0].recipientEmail).toBe('jean@example.com');
		expect(sendGiftCardEmailMock.mock.calls[0][0].printUrl).toContain(
			`/carte-cadeau/imprimer/${cards[0].id}`
		);
		expect(sendGiftCardReceiptEmailMock).toHaveBeenCalledTimes(1);
		expect(sendGiftCardReceiptEmailMock.mock.calls[0][0].buyerEmail).toBe('marie@example.com');
	});

	it('a repeated delivery of the same event issues and emails nothing new', async () => {
		await handleCheckoutSuccess(giftCardSession());
		await handleCheckoutSuccess(giftCardSession());

		expect(await cardsBySession('cs_gift_test_1')).toHaveLength(1);
		expect(sendGiftCardEmailMock).toHaveBeenCalledTimes(1);
		expect(sendGiftCardReceiptEmailMock).toHaveBeenCalledTimes(1);
	});

	it('two concurrent deliveries still issue exactly one card', async () => {
		await Promise.all([
			handleCheckoutSuccess(giftCardSession()),
			handleCheckoutSuccess(giftCardSession()),
		]);

		const cards = await cardsBySession('cs_gift_test_1');
		expect(cards).toHaveLength(1);
	});

	it('an unpaid session (delayed payment method) issues nothing', async () => {
		await handleCheckoutSuccess(giftCardSession({ payment_status: 'unpaid' }));

		expect(await cardsBySession('cs_gift_test_1')).toHaveLength(0);
		expect(sendGiftCardEmailMock).not.toHaveBeenCalled();
	});

	it('an asynchronously failed gift card session does nothing and throws nothing', async () => {
		await expect(
			handleAsyncPaymentFailed(giftCardSession({ payment_status: 'failed' }))
		).resolves.toBeUndefined();

		expect(await cardsBySession('cs_gift_test_1')).toHaveLength(0);
		expect(sendGiftCardEmailMock).not.toHaveBeenCalled();
	});

	it('sends the card email to the buyer when delivery is "to me"', async () => {
		await handleCheckoutSuccess(
			giftCardSession({
				id: 'cs_gift_test_2',
				metadata: {
					kind: 'gift_card',
					amount: '5000',
					buyerName: 'Marie Dupont',
					buyerEmail: 'marie@example.com',
					recipientName: 'Jean Martin',
					recipientEmail: '',
					message: '',
					delivery: 'buyer',
					locale: 'fr',
				},
			})
		);

		const cards = await cardsBySession('cs_gift_test_2');
		expect(cards).toHaveLength(1);
		expect(sendGiftCardEmailMock).toHaveBeenCalledTimes(1);
		expect(sendGiftCardEmailMock.mock.calls[0][0].recipientEmail).toBe('marie@example.com');
	});

	it('a non-gift-card session still warns about a missing payment (Reservation path untouched)', async () => {
		await handleCheckoutSuccess({
			id: 'cs_reservation_1',
			payment_status: 'paid',
			metadata: { reservationId: 'r1' },
		} as any);

		const cards = await testDb
			.select()
			.from(giftCards)
			.where(and(eq(giftCards.origin, 'online')));
		expect(cards).toHaveLength(0);
		expect(sendGiftCardEmailMock).not.toHaveBeenCalled();
	});
});

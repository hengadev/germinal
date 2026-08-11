// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
//
// Unlike tests/integration/payment-webhook.test.ts, no live Postgres database
// is available in this environment, so `db` is mocked at the query-builder
// level rather than backed by a real test database. `email` is mocked so no
// real SES / email-queue calls happen.
// ---------------------------------------------------------------------------

const findFirstDisputesMock = vi.fn();
const findFirstPaymentsMock = vi.fn();
const insertValuesMock = vi.fn();
const insertReturningMock = vi.fn();
const updateSetMock = vi.fn();
const updateWhereMock = vi.fn();
const sendDisputeAlertEmailMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../src/lib/server/services/email', () => ({
	sendDisputeAlertEmail: (...args: unknown[]) => sendDisputeAlertEmailMock(...args),
}));

vi.mock('../../../src/lib/server/db', () => ({
	db: {
		query: {
			disputes: {
				findFirst: (...args: unknown[]) => findFirstDisputesMock(...args),
			},
			payments: {
				findFirst: (...args: unknown[]) => findFirstPaymentsMock(...args),
			},
		},
		insert: () => ({
			values: (...args: unknown[]) => {
				insertValuesMock(...args);
				return {
					returning: () => insertReturningMock(),
				};
			},
		}),
		update: () => ({
			set: (...args: unknown[]) => {
				updateSetMock(...args);
				return {
					where: (...whereArgs: unknown[]) => updateWhereMock(...whereArgs),
				};
			},
		}),
	},
}));

let handleDisputeCreated: Awaited<
	typeof import('../../../src/lib/server/services/disputes')
>['handleDisputeCreated'];
let handleDisputeUpdated: Awaited<
	typeof import('../../../src/lib/server/services/disputes')
>['handleDisputeUpdated'];
let handleDisputeClosed: Awaited<
	typeof import('../../../src/lib/server/services/disputes')
>['handleDisputeClosed'];

beforeAll(async () => {
	const mod = await import('../../../src/lib/server/services/disputes');
	handleDisputeCreated = mod.handleDisputeCreated;
	handleDisputeUpdated = mod.handleDisputeUpdated;
	handleDisputeClosed = mod.handleDisputeClosed;
});

beforeEach(() => {
	vi.clearAllMocks();
	updateWhereMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakePayment(overrides?: Record<string, unknown>) {
	return {
		id: 'payment-1',
		reservationId: 'reservation-1',
		currency: 'EUR',
		reservation: {
			guestName: 'Jane Doe',
			guestEmail: 'jane@example.com',
			eventSession: {
				event: { title: 'Chef Dinner' },
			},
		},
		...overrides,
	} as any;
}

function fakeDispute(overrides?: Record<string, unknown>) {
	return {
		id: 'dp_test_1',
		object: 'dispute',
		amount: 5000,
		currency: 'eur',
		charge: 'ch_test_1',
		payment_intent: 'pi_test_1',
		reason: 'fraudulent',
		status: 'warning_needs_response',
		evidence_details: { due_by: null },
		...overrides,
	} as any;
}

// ---------------------------------------------------------------------------
// handleDisputeCreated
// ---------------------------------------------------------------------------

describe('handleDisputeCreated', () => {
	it('creates a dispute record for the matching Payment and notifies Admin', async () => {
		findFirstDisputesMock.mockResolvedValueOnce(undefined);
		findFirstPaymentsMock.mockResolvedValueOnce(fakePayment());
		insertReturningMock.mockResolvedValueOnce([
			{ id: 'dispute-1', currency: 'EUR' },
		]);

		await handleDisputeCreated(fakeDispute());

		// Record created against the correct payment
		expect(insertValuesMock).toHaveBeenCalledOnce();
		const insertArgs = insertValuesMock.mock.calls[0][0];
		expect(insertArgs.paymentId).toBe('payment-1');
		expect(insertArgs.stripeDisputeId).toBe('dp_test_1');
		expect(insertArgs.status).toBe('warning_needs_response');
		expect(insertArgs.amount).toBe(5000);

		// Admin notified
		expect(sendDisputeAlertEmailMock).toHaveBeenCalledOnce();
		const emailArgs = sendDisputeAlertEmailMock.mock.calls[0][0];
		expect(emailArgs.paymentId).toBe('payment-1');
		expect(emailArgs.guestEmail).toBe('jane@example.com');
		expect(emailArgs.eventTitle).toBe('Chef Dinner');

		// adminNotifiedAt stamped on the newly created row
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({ adminNotifiedAt: expect.any(Date) }),
		);
	});

	it('falls back to looking up the Payment by charge ID when payment_intent has no match', async () => {
		findFirstDisputesMock.mockResolvedValueOnce(undefined);
		findFirstPaymentsMock
			.mockResolvedValueOnce(undefined) // payment_intent lookup misses
			.mockResolvedValueOnce(fakePayment()); // charge lookup hits
		insertReturningMock.mockResolvedValueOnce([{ id: 'dispute-1', currency: 'EUR' }]);

		await handleDisputeCreated(fakeDispute());

		expect(findFirstPaymentsMock).toHaveBeenCalledTimes(2);
		expect(insertValuesMock).toHaveBeenCalledOnce();
		expect(sendDisputeAlertEmailMock).toHaveBeenCalledOnce();
	});

	it('no matching Payment — logs and skips without creating a record or notifying', async () => {
		findFirstDisputesMock.mockResolvedValueOnce(undefined);
		findFirstPaymentsMock.mockResolvedValue(undefined);

		await handleDisputeCreated(fakeDispute());

		expect(insertValuesMock).not.toHaveBeenCalled();
		expect(sendDisputeAlertEmailMock).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// handleDisputeUpdated / handleDisputeClosed — lifecycle updates
// ---------------------------------------------------------------------------

describe('handleDisputeUpdated', () => {
	it('updates the existing record matched by stripeDisputeId instead of creating a duplicate', async () => {
		findFirstDisputesMock.mockResolvedValueOnce({
			id: 'dispute-1',
			status: 'warning_needs_response',
			reason: 'fraudulent',
			currency: 'EUR',
		});

		await handleDisputeUpdated(fakeDispute({ status: 'under_review' }));

		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'under_review' }),
		);
		expect(insertValuesMock).not.toHaveBeenCalled();
		// No new record was created, so no (re-)notification should fire
		expect(sendDisputeAlertEmailMock).not.toHaveBeenCalled();
		// Existing-record path never needs to look up the Payment
		expect(findFirstPaymentsMock).not.toHaveBeenCalled();
	});
});

describe('handleDisputeClosed', () => {
	it('updates the existing record to its final status (e.g. lost) without duplicating or re-notifying', async () => {
		findFirstDisputesMock.mockResolvedValueOnce({
			id: 'dispute-1',
			status: 'under_review',
			reason: 'fraudulent',
			currency: 'EUR',
		});

		await handleDisputeClosed(fakeDispute({ status: 'lost' }));

		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'lost' }),
		);
		expect(insertValuesMock).not.toHaveBeenCalled();
		expect(sendDisputeAlertEmailMock).not.toHaveBeenCalled();
	});

	it('still creates and notifies if the created event was missed and closed arrives first', async () => {
		findFirstDisputesMock.mockResolvedValueOnce(undefined);
		findFirstPaymentsMock.mockResolvedValueOnce(fakePayment());
		insertReturningMock.mockResolvedValueOnce([{ id: 'dispute-1', currency: 'EUR' }]);

		await handleDisputeClosed(fakeDispute({ status: 'won' }));

		expect(insertValuesMock).toHaveBeenCalledOnce();
		expect(sendDisputeAlertEmailMock).toHaveBeenCalledOnce();
	});
});

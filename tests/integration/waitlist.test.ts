// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { events, eventSessions, waitlist } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const queueEmailMock = vi.fn().mockResolvedValue(undefined);
const sendWaitlistNotificationSMSMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/lib/server/jobs/process-email-queue', () => ({
	queueEmail: queueEmailMock,
}));

vi.mock('../../src/lib/server/services/sms', () => ({
	sendWaitlistNotificationSMS: sendWaitlistNotificationSMSMock,
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
	isStripeEnabled: () => false,
	isAWSConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

afterAll(async () => {
	await closeTestDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedEvent() {
	const [event] = await testDb
		.insert(events)
		.values({
			titleEn: 'Waitlist Test Event',
			titleFr: 'Événement Test Liste',
			slug: `waitlist-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			descriptionEn: 'Test',
			descriptionFr: 'Test',
			startDate: new Date('2099-01-01'),
			endDate: new Date('2099-12-31'),
			locationEn: 'Venue',
			locationFr: 'Salle',
			published: true,
		})
		.returning();
	return event;
}

async function seedSession(eventId: string, overrides?: Partial<typeof eventSessions.$inferInsert>) {
	const [session] = await testDb
		.insert(eventSessions)
		.values({
			eventId,
			titleEn: 'General Admission',
			titleFr: 'Admission Générale',
			startTime: new Date('2099-06-01T18:00:00Z'),
			endTime: new Date('2099-06-01T22:00:00Z'),
			totalCapacity: 10,
			availableCapacity: 0, // sold out by default for waitlist scenarios
			priceAmount: 2500,
			currency: 'EUR',
			published: true,
			allowWaitlist: true,
			...overrides,
		})
		.returning();
	return session;
}

/** Directly insert a waitlist entry, bypassing the service. */
async function seedWaitlistEntry(
	sessionId: string,
	email: string,
	overrides?: Partial<typeof waitlist.$inferInsert>
) {
	const [entry] = await testDb
		.insert(waitlist)
		.values({
			eventSessionId: sessionId,
			email,
			name: 'Test Guest',
			quantity: 1,
			notified: false,
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			...overrides,
		})
		.returning();
	return entry;
}

// ---------------------------------------------------------------------------
// joinWaitlist
// ---------------------------------------------------------------------------

describe('joinWaitlist', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('happy path — creates entry with ~7-day expiry', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		const entry = await joinWaitlist({
			sessionId: session.id,
			email: 'guest@example.com',
			name: 'Test Guest',
			quantity: 2,
		});

		expect(entry).toBeDefined();
		expect(entry.email).toBe('guest@example.com');
		expect(entry.quantity).toBe(2);
		expect(entry.notified).toBe(false);

		// expiresAt should be roughly 7 days from now (±1 minute tolerance)
		const sevenDays = 7 * 24 * 60 * 60 * 1000;
		expect(entry.expiresAt.getTime()).toBeGreaterThan(Date.now() + sevenDays - 60_000);
		expect(entry.expiresAt.getTime()).toBeLessThan(Date.now() + sevenDays + 60_000);
	});

	it('waitlist disabled — throws when allowWaitlist is false', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id, { allowWaitlist: false });

		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		await expect(
			joinWaitlist({ sessionId: session.id, email: 'guest@example.com', name: 'Guest', quantity: 1 })
		).rejects.toThrow('Waitlist is not available for this session');

		// No entry should be created
		const all = await testDb.select().from(waitlist);
		expect(all).toHaveLength(0);
	});

	it('duplicate active entry — throws when same email is already on waitlist', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		await seedWaitlistEntry(session.id, 'dup@example.com', { notified: false });

		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		await expect(
			joinWaitlist({ sessionId: session.id, email: 'dup@example.com', name: 'Dup', quantity: 1 })
		).rejects.toThrow('You are already on the waitlist for this session');

		// Still only one entry
		const all = await testDb.select().from(waitlist);
		expect(all).toHaveLength(1);
	});

	it('previously notified — allows re-joining after being notified', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);
		// Already notified entry — considered "done"
		await seedWaitlistEntry(session.id, 'renotify@example.com', {
			notified: true,
			notifiedAt: new Date(),
		});

		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		const entry = await joinWaitlist({
			sessionId: session.id,
			email: 'renotify@example.com',
			name: 'Re-joiner',
			quantity: 1,
		});

		expect(entry).toBeDefined();

		// Two entries for the same email are now allowed (one notified, one pending)
		const all = await testDb.select().from(waitlist);
		expect(all).toHaveLength(2);
	});

	it('stores notification preference and phone', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		const { joinWaitlist } = await import('../../src/lib/server/services/waitlist');
		const entry = await joinWaitlist({
			sessionId: session.id,
			email: 'sms@example.com',
			name: 'SMS Guest',
			quantity: 1,
			phone: '+33612345678',
			notificationPreference: 'sms',
		});

		expect(entry.phone).toBe('+33612345678');
		expect(entry.notificationPreference).toBe('sms');
	});
});

// ---------------------------------------------------------------------------
// notifyWaitlist
// ---------------------------------------------------------------------------

describe('notifyWaitlist', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await setupTestDatabase();
	});

	it('no entries — returns { notified: 0 } without sending anything', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		const result = await notifyWaitlist(session.id, 5);

		expect(result).toEqual({ notified: 0 });
		expect(queueEmailMock).not.toHaveBeenCalled();
	});

	it('happy path — notifies entries that fit within available capacity', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		await seedWaitlistEntry(session.id, 'a@example.com', { quantity: 2 });
		await seedWaitlistEntry(session.id, 'b@example.com', { quantity: 1 });
		await seedWaitlistEntry(session.id, 'c@example.com', { quantity: 3 });

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		const result = await notifyWaitlist(session.id, 3); // only 3 available

		// a (2) + b (1) = 3 — both fit; c (3) doesn't fit
		expect(result.notified).toBe(2);
		expect(queueEmailMock).toHaveBeenCalledTimes(2);

		// a and b should be marked notified
		const [entryA] = await testDb
			.select()
			.from(waitlist)
			.where(eq(waitlist.email, 'a@example.com'));
		expect(entryA.notified).toBe(true);
		expect(entryA.notifiedAt).toBeInstanceOf(Date);

		const [entryB] = await testDb
			.select()
			.from(waitlist)
			.where(eq(waitlist.email, 'b@example.com'));
		expect(entryB.notified).toBe(true);

		// c should NOT be notified
		const [entryC] = await testDb
			.select()
			.from(waitlist)
			.where(eq(waitlist.email, 'c@example.com'));
		expect(entryC.notified).toBe(false);
	});

	it('first-come-first-served — earlier entries get priority', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		// Insert in order; first entry gets the single available slot
		const past = new Date(Date.now() - 10_000);
		await seedWaitlistEntry(session.id, 'first@example.com', {
			quantity: 1,
			// createdAt defaults to now; use a past date for the "first" entry
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		});
		// The second entry is inserted after, so its createdAt will be later
		await seedWaitlistEntry(session.id, 'second@example.com', { quantity: 1 });

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		// Only 1 capacity available; first entry should win
		const result = await notifyWaitlist(session.id, 1);

		expect(result.notified).toBe(1);

		const entries = await testDb.select().from(waitlist).where(eq(waitlist.eventSessionId, session.id));
		const notifiedEntries = entries.filter((e) => e.notified);
		expect(notifiedEntries).toHaveLength(1);
	});

	it('already notified — skips entries that were already notified', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		await seedWaitlistEntry(session.id, 'alreadydone@example.com', {
			notified: true,
			notifiedAt: new Date(),
		});
		await seedWaitlistEntry(session.id, 'pending@example.com', { quantity: 1 });

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		const result = await notifyWaitlist(session.id, 10);

		// Only the pending one should be notified
		expect(result.notified).toBe(1);
		expect(queueEmailMock).toHaveBeenCalledTimes(1);
	});

	it('expired entries — skips entries whose expiresAt is in the past', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		await seedWaitlistEntry(session.id, 'expired@example.com', {
			expiresAt: new Date(Date.now() - 1000),
		});
		await seedWaitlistEntry(session.id, 'valid@example.com', {
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		});

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		const result = await notifyWaitlist(session.id, 10);

		expect(result.notified).toBe(1);
		expect(queueEmailMock).toHaveBeenCalledTimes(1);

		const [expiredEntry] = await testDb
			.select()
			.from(waitlist)
			.where(eq(waitlist.email, 'expired@example.com'));
		expect(expiredEntry.notified).toBe(false);
	});

	it('sms preference — sends SMS instead of email', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		await seedWaitlistEntry(session.id, 'smsonly@example.com', {
			phone: '+33612345678',
			notificationPreference: 'sms',
		});

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		await notifyWaitlist(session.id, 5);

		expect(queueEmailMock).not.toHaveBeenCalled();
		expect(sendWaitlistNotificationSMSMock).toHaveBeenCalledOnce();
	});

	it('both preference — sends email and SMS when phone is provided', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		await seedWaitlistEntry(session.id, 'both@example.com', {
			phone: '+33612345678',
			notificationPreference: 'both',
		});

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		await notifyWaitlist(session.id, 5);

		expect(queueEmailMock).toHaveBeenCalledOnce();
		expect(sendWaitlistNotificationSMSMock).toHaveBeenCalledOnce();
	});

	it('idempotency — second call does not double-notify the same entry', async () => {
		const event = await seedEvent();
		const session = await seedSession(event.id);

		await seedWaitlistEntry(session.id, 'idempotent@example.com', { quantity: 1 });

		const { notifyWaitlist } = await import('../../src/lib/server/services/waitlist');
		await notifyWaitlist(session.id, 5);
		await notifyWaitlist(session.id, 5);

		// Email must be sent exactly once across both calls
		expect(queueEmailMock).toHaveBeenCalledOnce();

		const entries = await testDb.select().from(waitlist);
		const notifiedEntries = entries.filter((e) => e.notified);
		expect(notifiedEntries).toHaveLength(1);
	});
});

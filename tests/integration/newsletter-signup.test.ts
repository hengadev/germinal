// @vitest-environment node
//
// Issue 053 — newsletter signup with double opt-in. A form signup stores an
// unconfirmed row and sends one confirmation email; the confirmation link
// puts the address on the list; a duplicate reveals nothing and sends at
// most one confirmation per day; a confirmed subscriber gets none; the
// purge drops stale unconfirmed form rows. Integration tests against a real
// test database.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { subscribers } from '../../src/lib/server/db/schema';
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL,
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
	},
	isBrevoConfigured: () => false,
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

const sendConfirmationEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/lib/server/services/email', () => ({
	sendNewsletterConfirmationEmail: sendConfirmationEmail,
}));

const {
	subscribeFromForm,
	confirmByToken,
	unsubscribeByToken,
} = await import('../../src/lib/server/services/subscribers');
const { purgePersonalData } = await import('../../src/lib/server/jobs/purge-personal-data');
const { exportSubscribersToCSV } = await import('../../src/lib/server/services/export');

const DAY = 24 * 60 * 60 * 1000;

afterAll(async () => {
	await closeTestDatabase();
});

beforeEach(async () => {
	await setupTestDatabase();
	sendConfirmationEmail.mockClear();
});

async function subscriberByEmail(email: string) {
	const [row] = await testDb.select().from(subscribers).where(eq(subscribers.email, email));
	return row ?? null;
}

describe('newsletter signup (issue 053)', () => {
	it('a signup stores an unconfirmed form row and queues one confirmation email', async () => {
		const result = await subscribeFromForm('  Guest@Example.com ', 'fr');
		expect(result.ok).toBe(true);

		const row = await subscriberByEmail('guest@example.com');
		expect(row).not.toBeNull();
		expect(row!.source).toBe('form');
		expect(row!.confirmedAt).toBeNull();
		expect(row!.unsubscribedAt).toBeNull();
		expect(row!.confirmationToken).toMatch(/^[0-9a-f]{64}$/);

		if (result.ok && result.sendEmail) {
			expect(result.confirmationToken).toBe(row!.confirmationToken);
			expect(result.locale).toBe('fr');
		}
	});

	it('an invalid email is refused', async () => {
		expect((await subscribeFromForm('not-an-email', 'fr')).ok).toBe(false);
		expect(await subscriberByEmail('not-an-email')).toBeNull();
	});

	it('confirming by token puts the address on the list; unconfirmed rows are never exported', async () => {
		const result = await subscribeFromForm('export@example.com', 'en');
		const before = await exportSubscribersToCSV();
		expect(before).not.toContain('export@example.com');

		const row = await subscriberByEmail('export@example.com');
		expect(await confirmByToken(row!.confirmationToken)).toBe(true);
		// A second click confirms nothing.
		expect(await confirmByToken(row!.confirmationToken)).toBe(false);

		const confirmed = await subscriberByEmail('export@example.com');
		expect(confirmed!.confirmedAt).not.toBeNull();
		expect(confirmed!.unsubscribedAt).toBeNull();

		expect(await exportSubscribersToCSV()).toContain('export@example.com');
	});

	it('a duplicate signup reveals nothing and sends at most one confirmation per day', async () => {
		const first = await subscribeFromForm('dupe@example.com', 'en');
		expect(first.ok && first.sendEmail).toBe(true);

		// Same day: same neutral answer, but no second email.
		const second = await subscribeFromForm('DUPE@example.com', 'fr');
		expect(second.ok).toBe(true);
		expect(second.ok && second.sendEmail).toBe(false);

		// A day later: a fresh confirmation may go out.
		const [row] = await testDb
			.select()
			.from(subscribers)
			.where(eq(subscribers.email, 'dupe@example.com'));
		await testDb
			.update(subscribers)
			.set({ updatedAt: new Date(Date.now() - 2 * DAY) })
			.where(eq(subscribers.id, row.id));

		const third = await subscribeFromForm('dupe@example.com', 'en');
		expect(third.ok && third.sendEmail).toBe(true);
		// And the new email carries the fresh token.
		const refreshed = await subscriberByEmail('dupe@example.com');
		if (third.ok && third.sendEmail) {
			expect(third.confirmationToken).toBe(refreshed!.confirmationToken);
		}
	});

	it('a confirmed and subscribed address gets no email on a new signup', async () => {
		await subscribeFromForm('done@example.com', 'en');
		const [row] = await testDb
			.select()
			.from(subscribers)
			.where(eq(subscribers.email, 'done@example.com'));
		await confirmByToken(row.confirmationToken);

		const again = await subscribeFromForm('done@example.com', 'fr');
		expect(again.ok).toBe(true);
		expect(again.ok && again.sendEmail).toBe(false);
	});

	it('a confirmed subscriber can unsubscribe by token (the 052 page)', async () => {
		await subscribeFromForm('bye@example.com', 'en');
		const [row] = await testDb
			.select()
			.from(subscribers)
			.where(eq(subscribers.email, 'bye@example.com'));
		await confirmByToken(row.confirmationToken);

		expect(await unsubscribeByToken(row.unsubscribeToken)).toBe(true);
		expect(await unsubscribeByToken(row.unsubscribeToken)).toBe(false);
		expect(await exportSubscribersToCSV()).not.toContain('bye@example.com');
	});

	it('after an unsubscribe, signing up again needs a new confirmation, which works', async () => {
		await subscribeFromForm('again@example.com', 'fr');
		const first = (await subscriberByEmail('again@example.com'))!;
		await confirmByToken(first.confirmationToken);
		await unsubscribeByToken(first.unsubscribeToken);
		// A day later, the same address signs up again.
		await testDb
			.update(subscribers)
			.set({ updatedAt: new Date(Date.now() - 2 * DAY) })
			.where(eq(subscribers.email, 'again@example.com'));
		const result = await subscribeFromForm('again@example.com', 'fr');
		expect(result.ok && result.sendEmail).toBe(true);
		const pending = (await subscriberByEmail('again@example.com'))!;
		expect(pending.confirmedAt).toBeNull();
		expect(await exportSubscribersToCSV()).not.toContain('again@example.com');
		expect(await confirmByToken(pending.confirmationToken)).toBe(true);
		expect(await exportSubscribersToCSV()).toContain('again@example.com');
	});

	it('the purge removes unconfirmed form rows older than 30 days, and nothing else', async () => {
		await subscribeFromForm('stale@example.com', 'en');
		await testDb
			.update(subscribers)
			.set({ updatedAt: new Date(Date.now() - 31 * DAY) })
			.where(eq(subscribers.email, 'stale@example.com'));

		await subscribeFromForm('fresh@example.com', 'en');
		await subscribeFromForm('stale-booking@example.com', 'en');
		// A booking-sourced row is confirmed at once: never purged here.
		await testDb
			.update(subscribers)
			.set({
				source: 'booking',
				confirmedAt: new Date(Date.now() - 40 * DAY),
				updatedAt: new Date(Date.now() - 40 * DAY),
			})
			.where(eq(subscribers.email, 'stale-booking@example.com'));

		const result = await purgePersonalData();
		expect(result.subscribersDeleted).toBe(1);
		expect(await subscriberByEmail('stale@example.com')).toBeNull();
		expect(await subscriberByEmail('fresh@example.com')).not.toBeNull();
		expect(await subscriberByEmail('stale-booking@example.com')).not.toBeNull();
	});
});

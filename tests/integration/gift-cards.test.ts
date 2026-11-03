// @vitest-environment node
/**
 * Issue 063 — gift cards against the real database: issue, redeem,
 * credit, extend, cancel, the findUsable reasons, the balance always
 * equal to the initial amount plus the ledger, and two concurrent
 * redemptions never overspending.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, giftCardLedger, giftCards, users } from '../../src/lib/server/db/schema';
// The service pulls in db (whose mock reads testDb): import it lazily.
let svc: typeof import('../../src/lib/server/services/gift-cards');
import {
	getTestDatabase,
	setupTestDatabase,
	closeTestDatabase,
	TEST_DATABASE_URL
} from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
}));

vi.mock('../../src/lib/server/env', () => ({
	env: {
		DATABASE_URL: TEST_DATABASE_URL,
		USE_MOCK_DATA: false,
		PUBLIC_URL: 'http://localhost:5173',
		BREVO_API_KEY: 'test-key',
	},
	isBrevoConfigured: () => true,
}));

beforeEach(async () => {
	svc = await import('../../src/lib/server/services/gift-cards');
	await setupTestDatabase();
	// users isn't truncated by the fixture: seed the actor once per run.
	if (!actorSeeded) {
	await testDb.insert(users).values({
		id: ACTOR,
		email: `actor-${crypto.randomUUID()}@example.com`,
		firstName: 'Admin',
		lastName: 'Test',
		passwordHash: 'x',
		role: 'admin',
	});
	actorSeeded = true;
	}
});
let actorSeeded = false;

afterAll(async () => {
	await closeTestDatabase();
});

const ACTOR = crypto.randomUUID();

describe('issue', () => {
	it('starts with balance = initial amount, empty ledger, one-year expiry', async () => {
		const before = Date.now();
		const card = await svc.issueGiftCard({ amount: 5000 });
		expect(card.balance).toBe(5000);
		expect(card.status).toBe('active');
		expect(card.code).toMatch(/^GERM[23456789A-HJ-NP-Z]{8}$/);
		const oneYear = 365 * 24 * 60 * 60 * 1000;
		expect(card.expiresAt.getTime()).toBeGreaterThan(before + oneYear - 60_000);
		expect(card.expiresAt.getTime()).toBeLessThan(Date.now() + oneYear + 60_000);
		expect(await svc.ledgerSum(card.id)).toBe(0);
	});

	it('keeps recipient, message and origin', async () => {
		const card = await svc.issueGiftCard({
			amount: 2500,
			recipientName: 'Camille',
			recipientEmail: 'camille@example.com',
			message: 'Joyeux anniversaire',
			origin: 'admin'
		});
		expect(card.recipientName).toBe('Camille');
		expect(card.message).toBe('Joyeux anniversaire');
		expect(card.origin).toBe('admin');
	});
});

describe('findUsable', () => {
	it('finds an active card by typed code in any shape', async () => {
		const card = await svc.issueGiftCard({ amount: 1000 });
		const typed = card.code.toLowerCase().replace(/^GERM-/, 'germ  ').replace('-', ' -');
		const result = await svc.findUsableGiftCard(typed);
		expect(result.ok).toBe(true);
	});

	it('gives every refusal reason', async () => {
		const unknown = await svc.findUsableGiftCard('GERM-XXXX-XXXX');
		expect(unknown).toEqual({ ok: false, reason: 'unknown' });

		const expired = await svc.issueGiftCard({
			amount: 1000,
			expiresAt: new Date(Date.now() - 1000)
		});
		expect(await svc.findUsableGiftCard(expired.code)).toEqual({ ok: false, reason: 'expired' });

		const cancelled = await svc.issueGiftCard({ amount: 1000 });
		await svc.cancelGiftCard(cancelled.code, ACTOR);
		expect(await svc.findUsableGiftCard(cancelled.code)).toEqual({ ok: false, reason: 'cancelled' });

		const empty = await svc.issueGiftCard({ amount: 1000 });
		await svc.redeemGiftCard(empty.code, { amount: 1000, reason: 'door' });
		expect(await svc.findUsableGiftCard(empty.code)).toEqual({ ok: false, reason: 'empty' });
	});
});

describe('redeem and credit', () => {
	it('moves the balance and the ledger together', async () => {
		const card = await svc.issueGiftCard({ amount: 5000 });
		await svc.redeemGiftCard(card.code, { amount: 2000, reason: 'booking', actorId: ACTOR });
		const [after] = await testDb.select().from(giftCards).where(eq(giftCards.id, card.id));
		expect(after.balance).toBe(3000);
		// Balance = initial + ledger, always.
		expect(after.initialAmount + (await svc.ledgerSum(card.id))).toBe(after.balance);

		await svc.creditGiftCard(card.code, { amount: 500, reason: 'refund' });
		const [refunded] = await testDb.select().from(giftCards).where(eq(giftCards.id, card.id));
		expect(refunded.balance).toBe(3500);
		const rows = await testDb
			.select()
			.from(giftCardLedger)
			.where(eq(giftCardLedger.giftCardId, card.id));
		expect(rows.map((r) => r.amount).sort()).toEqual([-2000, 500]);
	});

	it('refuses to redeem above the balance', async () => {
		const card = await svc.issueGiftCard({ amount: 2000 });
		const result = await svc.redeemGiftCard(card.code, { amount: 2001, reason: 'door' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('Solde insuffisant.');
		const [after] = await testDb.select().from(giftCards).where(eq(giftCards.id, card.id));
		expect(after.balance).toBe(2000);
	});

	it('refuses to credit above the initial amount', async () => {
		const card = await svc.issueGiftCard({ amount: 2000 });
		const result = await svc.creditGiftCard(card.code, { amount: 100, reason: 'admin_adjustment' });
		expect(result.ok).toBe(false);
		const [after] = await testDb.select().from(giftCards).where(eq(giftCards.id, card.id));
		expect(after.balance).toBe(2000);
	});

	it('never overspends under two concurrent redemptions', async () => {
		const card = await svc.issueGiftCard({ amount: 3000 });
		const first = svc.redeemGiftCard(card.code, { amount: 2000, reason: 'booking' });
		const second = svc.redeemGiftCard(card.code, { amount: 2000, reason: 'booking' });
		const results = await Promise.all([first, second]);
		expect(results.filter((r) => r.ok).length).toBe(1);
		const [after] = await testDb.select().from(giftCards).where(eq(giftCards.id, card.id));
		expect(after.balance).toBe(1000);
		expect(await svc.ledgerSum(card.id)).toBe(-2000);
	});
});

describe('extend and cancel', () => {
	it('moves the expiry', async () => {
		const card = await svc.issueGiftCard({ amount: 1000 });
		const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
		const result = await svc.extendGiftCard(card.id, future);
		expect(result.ok).toBe(true);
		const [after] = await testDb.select().from(giftCards).where(eq(giftCards.id, card.id));
		expect(after.expiresAt.toISOString()).toBe(future.toISOString());
	});

	it('cancels once, keeps the ledger, audits the masked code', async () => {
		const card = await svc.issueGiftCard({ amount: 1000 });
		await svc.redeemGiftCard(card.code, { amount: 400, reason: 'door' });
		const result = await svc.cancelGiftCard(card.id, ACTOR);
		expect(result.ok).toBe(true);

		const again = await svc.cancelGiftCard(card.id, ACTOR);
		expect(again.ok).toBe(false);

		const [after] = await testDb.select().from(giftCards).where(eq(giftCards.id, card.id));
		expect(after.status).toBe('cancelled');
		expect(await svc.ledgerSum(card.id)).toBe(-400);

		const entries = await testDb
			.select()
			.from(auditLog)
			.where(eq(auditLog.entityId, card.id));
		expect(entries.length).toBe(1);
		const meta = (entries[0].metadata ?? {}) as { code?: string };
		expect(meta.code).toBe(`GERM…${card.code.slice(-4)}`);
		expect(JSON.stringify(entries[0])).not.toContain(card.code);
	});
});

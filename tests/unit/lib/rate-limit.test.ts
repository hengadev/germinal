// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module builds its ioredis client at import time — swap in the
// in-memory fake so tests can observe keys, counters and outages.
vi.mock('ioredis', async () => ({
	default: (await import('../helpers/fake-redis')).FakeRedis,
}));

import { FakeRedis } from '../helpers/fake-redis';
import { checkRateLimit, resetLoginRateLimit, type RateLimitAction } from '../../../src/lib/server/rate-limit';

const IP = '203.0.113.7';

/** The documented budget of every policy (see the POLICIES table). */
const EXPECTED_BUDGETS: Record<RateLimitAction, { maxAttempts: number; windowSeconds: number }> = {
	login: { maxAttempts: 5, windowSeconds: 15 * 60 },
	'reservation-create': { maxAttempts: 10, windowSeconds: 10 * 60 },
	inquiry: { maxAttempts: 5, windowSeconds: 60 * 60 },
	'waitlist-join': { maxAttempts: 3, windowSeconds: 60 * 60 },
	'find-ticket': { maxAttempts: 3, windowSeconds: 60 * 60 },
	'promo-code-validation': { maxAttempts: 30, windowSeconds: 60 },
};

function redis(): FakeRedis {
	if (!FakeRedis.instance) throw new Error('module not imported yet');
	return FakeRedis.instance;
}

/** Spend an action's whole budget, then one attempt too many. */
async function exhaust(action: RateLimitAction, identifier = IP) {
	const { maxAttempts } = EXPECTED_BUDGETS[action];
	const decisions = [];
	for (let i = 0; i < maxAttempts + 1; i++) {
		decisions.push(await checkRateLimit(action, identifier));
	}
	return decisions;
}

describe('rate-limit policy table', () => {
	beforeEach(() => {
		redis().store.clear();
		redis().ttls.clear();
		redis().unavailable = false;
	});

	it('gives every action its documented budget', async () => {
		for (const action of Object.keys(EXPECTED_BUDGETS) as RateLimitAction[]) {
			const { maxAttempts } = EXPECTED_BUDGETS[action];
			const decisions = await exhaust(action);

			for (let i = 0; i < maxAttempts; i++) {
				expect(decisions[i], `${action} attempt ${i + 1}`).toEqual({ status: 'allowed' });
			}
			expect(decisions[maxAttempts], `${action} attempt ${maxAttempts + 1}`).toMatchObject({
				status: 'denied',
			});
		}
	});

	it('exhausting one policy leaves every other policy untouched for the same IP', async () => {
		// Spend the whole waitlist-join budget for this IP.
		await exhaust('waitlist-join');

		// Every other policy still has its full budget for the same IP.
		for (const action of Object.keys(EXPECTED_BUDGETS) as RateLimitAction[]) {
			if (action === 'waitlist-join') continue;
			expect(await checkRateLimit(action, IP), action).toEqual({ status: 'allowed' });
		}

		// And the counters live under distinct Redis keys: exactly one key
		// per action namespace, no shared `strict` bucket.
		const keys = [...redis().store.keys()].sort();
		expect(keys).toEqual([
			'ratelimit:find-ticket:203.0.113.7',
			'ratelimit:inquiry:203.0.113.7',
			'ratelimit:login:203.0.113.7',
			'ratelimit:promo-code-validation:203.0.113.7',
			'ratelimit:reservation-create:203.0.113.7',
			'ratelimit:waitlist-join:203.0.113.7',
		]);
	});

	it('denied decisions say how long until retry is possible', async () => {
		await exhaust('find-ticket');
		const decision = await checkRateLimit('find-ticket', IP);

		expect(decision.status).toBe('denied');
		if (decision.status === 'denied') {
			expect(decision.retryAfterSeconds).toBeGreaterThan(0);
			expect(decision.retryAfterSeconds).toBeLessThanOrEqual(EXPECTED_BUDGETS['find-ticket'].windowSeconds);
		}
	});

	it('a successful login resets only the login counter', async () => {
		// Spend some attempts of several policies for the same IP.
		await checkRateLimit('login', IP);
		await checkRateLimit('login', IP);
		await checkRateLimit('inquiry', IP);
		await checkRateLimit('reservation-create', IP);
		expect(redis().store.get('ratelimit:login:203.0.113.7')).toBe(2);

		// The success path of the login action calls this — and nothing else
		// calls any reset.
		await resetLoginRateLimit(IP);

		// The login counter is gone; the others are untouched.
		expect(redis().store.get('ratelimit:login:203.0.113.7')).toBeUndefined();
		expect(redis().store.get('ratelimit:inquiry:203.0.113.7')).toBe(1);
		expect(redis().store.get('ratelimit:reservation-create:203.0.113.7')).toBe(1);

		// A fresh login attempt is allowed again with a brand-new counter.
		expect(await checkRateLimit('login', IP)).toEqual({ status: 'allowed' });
		expect(redis().store.get('ratelimit:login:203.0.113.7')).toBe(1);
	});

	it('reports unavailable for every policy when Redis is unreachable (fail-closed)', async () => {
		redis().unavailable = true;

		for (const action of Object.keys(EXPECTED_BUDGETS) as RateLimitAction[]) {
			expect(await checkRateLimit(action, IP), action).toEqual({ status: 'unavailable' });
		}

		// The login reset is best-effort and must not throw either.
		await expect(resetLoginRateLimit(IP)).resolves.toBeUndefined();
	});
});

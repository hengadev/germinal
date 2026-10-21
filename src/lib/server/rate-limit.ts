/**
 * Redis-backed rate limiting, one named policy per protected action.
 *
 * Callers ask a single question — "may this client IP perform action X?"
 * (`checkRateLimit(action, ip)`) — and get back one of three answers:
 * allowed, denied (with seconds until retry), or unavailable. Each action
 * has its own entry in POLICIES below, with its own Redis namespace and
 * budget, so exhausting one action's budget never eats another's for the
 * same client IP: sending an Inquiry doesn't spend booking attempts.
 *
 * Counters live in Redis, not per-process memory: the app container is
 * replaced on every deploy and on every configuration change (Docker
 * Compose, infrastructure/compose/), and an in-process Map would reset
 * every limit each time — and silently weaken them again if the app ever
 * runs more than one process. (It was written when production ran two
 * Swarm replicas, where a Map made every limit about half as strict.)
 *
 * Fail-closed by design: if Redis is unreachable, `checkRateLimit` reports
 * `unavailable` instead of `allowed`. A rate limiter that fails open during
 * an outage is worse than the protected endpoint being unavailable — call
 * sites must answer 503 on `unavailable`, never treat it as "allowed".
 *
 * Nothing resets a counter on success except login: `resetLoginRateLimit`
 * is the only reset function, and it deletes only the login namespace's
 * key. (A reset-on-success for the Inquiry form previously handed back
 * booking attempts, which is why this is now forbidden by construction.)
 *
 * How the client IP is obtained is a separate concern (issue 012): this
 * module just takes an opaque identifier string.
 */

import Redis from 'ioredis';
import { config, env } from './env';
import { logger } from './logger';

declare module 'ioredis' {
	interface RedisCommander<Context> {
		rateLimitIncr(key: string, windowSeconds: number): Promise<number>;
	}
}

/**
 * Atomically increments the counter and — only on the first increment of a
 * window — sets its expiry. A separate INCR then EXPIRE would race: if the
 * process dies between the two calls, the key never expires. Only arming
 * the TTL on `current == 1` also preserves the original in-memory
 * semantics, where the window's reset time is fixed at first attempt and
 * not pushed back by later attempts within the same window.
 */
const INCR_AND_EXPIRE_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
	redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

const redis = new Redis({
	host: env.REDIS_HOST,
	port: env.REDIS_PORT,
	db: env.REDIS_DB,
	// Bound how long a command waits during a reconnect before failing, so a
	// fail-closed rejection comes back quickly (~tens of ms) during a real
	// outage — without disabling the offline queue outright, which would
	// spuriously reject the very first command issued before the initial
	// connection finishes (a real race: this client is constructed at
	// module-load time, and connecting is async).
	maxRetriesPerRequest: 1,
	connectTimeout: 3000,
});

// Required so a dropped connection logs instead of crashing the process
// (an ioredis client with no 'error' listener throws on connection errors).
// Background reconnection (ioredis's default retryStrategy) still runs, so
// service recovers automatically once Redis is reachable again.
redis.on('error', (err) => {
	logger.error({ err }, 'Redis connection error (rate limiting)');
});

redis.defineCommand('rateLimitIncr', {
	numberOfKeys: 1,
	lua: INCR_AND_EXPIRE_SCRIPT
});

const KEY_PREFIX = 'ratelimit';

function buildKey(namespace: string, identifier: string): string {
	return `${KEY_PREFIX}:${namespace}:${identifier}`;
}

/**
 * One protected action = one policy. `namespace` is the Redis key
 * namespace: no two actions may share one, or their counters (and budgets)
 * would collide for the same identifier.
 */
interface RateLimitPolicy {
	namespace: string;
	maxAttempts: number;
	windowMs: number;
}

/**
 * The table of rate-limit policies — the single source of truth for every
 * budget. Each entry also names the action's own Redis namespace, so
 * exhausting one policy leaves every other policy's budget for that IP
 * untouched.
 */
const POLICIES = {
	// Admin/Staff login: 5 attempts per 15 minutes per client IP. The only
	// policy whose counter resets on success (see resetLoginRateLimit).
	login: { namespace: 'login', maxAttempts: 5, windowMs: 15 * 60 * 1000 },
	// Reservation creation: 10 attempts per 10 minutes per client IP
	// (from the app config, src/lib/server/env.ts `config.rateLimit`).
	'reservation-create': {
		namespace: 'reservation-create',
		maxAttempts: config.rateLimit.reservationMaxAttempts,
		windowMs: config.rateLimit.reservationWindowMs,
	},
	// Inquiry (contact form): 5 submissions per hour per client IP
	// (from the app config, src/lib/server/env.ts `config.rateLimit`).
	// A successful Inquiry resets no counter.
	inquiry: {
		namespace: 'inquiry',
		maxAttempts: config.rateLimit.contactFormMaxAttempts,
		windowMs: config.rateLimit.contactFormWindowMs,
	},
	// Waitlist join: 3 joins per hour per client IP.
	'waitlist-join': {
		namespace: 'waitlist-join',
		maxAttempts: 3,
		windowMs: 60 * 60 * 1000,
	},
	// find-ticket (resend ticket links): 3 lookups per hour per client IP.
	'find-ticket': {
		namespace: 'find-ticket',
		maxAttempts: 3,
		windowMs: 60 * 60 * 1000,
	},
	// Promo-code validation: 30 attempts per minute per client IP.
	'promo-code-validation': {
		namespace: 'promo-code-validation',
		maxAttempts: 30,
		windowMs: 60 * 1000,
	},
} as const satisfies Record<string, RateLimitPolicy>;

/** Every action with a rate-limit policy. */
export type RateLimitAction = keyof typeof POLICIES;

/**
 * The answer to "may this client IP perform action X?".
 *
 * - `allowed`: the attempt is within budget (this attempt is counted).
 * - `denied`: over budget; `retryAfterSeconds` says when to try again.
 * - `unavailable`: the backing store can't be reached. Fail-closed —
 *   callers must reject the request (503), never treat it as "allowed".
 */
export type RateLimitDecision =
	| { status: 'allowed' }
	| { status: 'denied'; retryAfterSeconds: number }
	| { status: 'unavailable' };

/**
 * Check whether an identifier (client IP) may perform the given action.
 * Consumes one attempt from that action's own budget when allowed.
 *
 * @throws only on unexpected (non-Redis) programming errors; an
 *   unreachable Redis is reported as `{ status: 'unavailable' }`.
 */
export async function checkRateLimit(
	action: RateLimitAction,
	identifier: string
): Promise<RateLimitDecision> {
	const { namespace, maxAttempts, windowMs } = POLICIES[action];
	const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
	const key = buildKey(namespace, identifier);
	try {
		const current = await redis.rateLimitIncr(key, windowSeconds);
		if (current <= maxAttempts) {
			return { status: 'allowed' };
		}
		// How long until this window's counter expires = when retry is
		// possible. If the TTL read comes back empty (key just vanished —
		// new window), fall back to the full window so the 429 still says
		// when the client may retry.
		const ttl = await redis.ttl(key);
		return { status: 'denied', retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
	} catch (err) {
		logger.error({ err, action }, 'Rate limiter backing store unavailable (fail-closed)');
		return { status: 'unavailable' };
	}
}

/**
 * Reset the login counter for an identifier. Call this after a successful
 * login — it is the only reset, and clears only the login namespace's key,
 * never any other policy's counter.
 *
 * Best-effort: if Redis hiccups right at this moment, swallowing the error
 * just means the counter clears on its own TTL later instead of
 * immediately, so an already-succeeded login isn't turned into a 500.
 */
export async function resetLoginRateLimit(identifier: string): Promise<void> {
	try {
		await redis.del(buildKey(POLICIES.login.namespace, identifier));
	} catch (err) {
		logger.warn({ err, identifier }, 'Rate limit reset failed (non-fatal)');
	}
}

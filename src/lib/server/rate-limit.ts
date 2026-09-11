/**
 * Redis-backed rate limiter, shared across all app replicas.
 *
 * Production runs multiple Swarm replicas behind a load-balanced VIP
 * (docker-stack.yml, deploy.replicas: 2) with no process affinity, so
 * counters must live in a shared store rather than per-process memory —
 * an in-process Map made every configured limit roughly half as strict as
 * configured in production, silently.
 *
 * Fail-closed by design: if Redis is unreachable, `checkRateLimit` /
 * `createRateLimiter(...).check` throw `RateLimitUnavailableError` instead
 * of allowing the request through. A rate limiter that fails open during
 * an outage is worse than the protected endpoint being unavailable — call
 * sites are expected to catch this and reject the request (503), not
 * treat it as "allowed".
 */

import Redis from 'ioredis';
import { env } from './env';
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
 * Thrown when the rate limiter's backing store can't be reached. Callers
 * must treat this as "reject the request" (503), never as "allowed" —
 * see the fail-closed rationale in the module docstring.
 */
export class RateLimitUnavailableError extends Error {
	constructor(cause: unknown) {
		super('Rate limiter backing store is unavailable');
		this.name = 'RateLimitUnavailableError';
		this.cause = cause;
	}
}

async function incrementAndCheck(
	namespace: string,
	identifier: string,
	maxAttempts: number,
	windowMs: number
): Promise<boolean> {
	const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
	try {
		const current = await redis.rateLimitIncr(buildKey(namespace, identifier), windowSeconds);
		return current <= maxAttempts;
	} catch (err) {
		if (err instanceof RateLimitUnavailableError) throw err;
		throw new RateLimitUnavailableError(err);
	}
}

async function getReset(namespace: string, identifier: string): Promise<number> {
	const ttl = await redis.ttl(buildKey(namespace, identifier));
	return ttl > 0 ? ttl : 0;
}

async function getCount(namespace: string, identifier: string): Promise<number> {
	const value = await redis.get(buildKey(namespace, identifier));
	return value ? parseInt(value, 10) : 0;
}

/**
 * Best-effort: called after a request already succeeded (e.g. successful
 * login) to clear that identifier's counter early. Unlike the check itself,
 * this isn't a security boundary — if Redis hiccups right at this moment,
 * swallowing the error just means the counter clears on its own TTL later
 * instead of immediately, so a already-succeeded request isn't turned into
 * a 500.
 */
async function resetKey(namespace: string, identifier: string): Promise<void> {
	try {
		await redis.del(buildKey(namespace, identifier));
	} catch (err) {
		logger.warn({ err, namespace, identifier }, 'Rate limit reset failed (non-fatal)');
	}
}

// Configuration for the default "login" limiter
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_NAMESPACE = 'login';

/**
 * Check if a request from the given IP should be rate limited.
 * @param identifier - IP address or unique identifier
 * @returns true if allowed, false if rate limit exceeded
 * @throws {RateLimitUnavailableError} if Redis is unreachable — callers
 *   must reject the request, not treat this as "allowed".
 */
export function checkRateLimit(identifier: string): Promise<boolean> {
	return incrementAndCheck(LOGIN_NAMESPACE, identifier, MAX_ATTEMPTS, WINDOW_MS);
}

/**
 * Get remaining time until rate limit resets (in seconds)
 * @param identifier - IP address or unique identifier
 * @returns Seconds until reset, or 0 if not rate limited
 */
export function getRateLimitReset(identifier: string): Promise<number> {
	return getReset(LOGIN_NAMESPACE, identifier);
}

/**
 * Reset rate limit for a specific identifier.
 * Call this after successful login. Best-effort — see resetKey.
 * @param identifier - IP address or unique identifier
 */
export function resetRateLimit(identifier: string): Promise<void> {
	return resetKey(LOGIN_NAMESPACE, identifier);
}

/**
 * Get current attempt count for an identifier
 * @param identifier - IP address or unique identifier
 * @returns Number of attempts in current window
 */
export function getRateLimitCount(identifier: string): Promise<number> {
	return getCount(LOGIN_NAMESPACE, identifier);
}

/**
 * Configure rate limiting parameters
 * Use this to customize limits for different endpoints
 */
export interface RateLimitConfig {
	maxAttempts: number;
	windowMs: number;
}

/**
 * Create a custom rate limiter with specific configuration.
 * @param namespace - unique key namespace for this limiter, so its counters
 *   don't collide in Redis with any other limiter's counters for the same
 *   identifier (e.g. an IP hitting both the login limiter and an API
 *   limiter must not share one counter).
 */
export function createRateLimiter(namespace: string, config: RateLimitConfig) {
	return {
		check: (identifier: string): Promise<boolean> =>
			incrementAndCheck(namespace, identifier, config.maxAttempts, config.windowMs),
		reset: (identifier: string): Promise<void> => resetKey(namespace, identifier),
		getCount: (identifier: string): Promise<number> => getCount(namespace, identifier),
		getReset: (identifier: string): Promise<number> => getReset(namespace, identifier)
	};
}

// Pre-configured limiters for common use cases
export const apiRateLimiter = createRateLimiter('api', {
	maxAttempts: 100,
	windowMs: 60 * 1000 // 100 requests per minute
});

export const strictRateLimiter = createRateLimiter('strict', {
	maxAttempts: 3,
	windowMs: 60 * 60 * 1000 // 3 attempts per hour
});

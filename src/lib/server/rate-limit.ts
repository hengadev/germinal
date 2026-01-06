/**
 * In-memory rate limiter for development
 * For production, consider using Redis or a database-backed solution
 */

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

// Configuration
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean up expired entries every 5 minutes

/**
 * Check if a request from the given IP should be rate limited
 * @param identifier - IP address or unique identifier
 * @returns true if allowed, false if rate limit exceeded
 */
export function checkRateLimit(identifier: string): boolean {
	const now = Date.now();
	const attempt = loginAttempts.get(identifier);

	// No previous attempts or window expired
	if (!attempt || now > attempt.resetAt) {
		loginAttempts.set(identifier, {
			count: 1,
			resetAt: now + WINDOW_MS
		});
		return true;
	}

	// Within window, check if limit exceeded
	if (attempt.count >= MAX_ATTEMPTS) {
		return false;
	}

	// Increment counter
	attempt.count++;
	return true;
}

/**
 * Get remaining time until rate limit resets (in seconds)
 * @param identifier - IP address or unique identifier
 * @returns Seconds until reset, or 0 if not rate limited
 */
export function getRateLimitReset(identifier: string): number {
	const attempt = loginAttempts.get(identifier);
	if (!attempt) {
		return 0;
	}

	const now = Date.now();
	const remaining = Math.ceil((attempt.resetAt - now) / 1000);
	return Math.max(0, remaining);
}

/**
 * Reset rate limit for a specific identifier
 * Call this after successful login
 * @param identifier - IP address or unique identifier
 */
export function resetRateLimit(identifier: string): void {
	loginAttempts.delete(identifier);
}

/**
 * Get current attempt count for an identifier
 * @param identifier - IP address or unique identifier
 * @returns Number of attempts in current window
 */
export function getRateLimitCount(identifier: string): number {
	const attempt = loginAttempts.get(identifier);
	return attempt?.count || 0;
}

/**
 * Clean up expired rate limit entries
 * Runs periodically to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
	const now = Date.now();
	for (const [identifier, entry] of loginAttempts.entries()) {
		if (now > entry.resetAt) {
			loginAttempts.delete(identifier);
		}
	}
}

// Start cleanup interval
if (typeof setInterval !== 'undefined') {
	setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
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
 * Create a custom rate limiter with specific configuration
 * Useful for different endpoints (login, API, etc.)
 */
export function createRateLimiter(config: RateLimitConfig) {
	const attempts = new Map<string, RateLimitEntry>();

	return {
		check: (identifier: string): boolean => {
			const now = Date.now();
			const attempt = attempts.get(identifier);

			if (!attempt || now > attempt.resetAt) {
				attempts.set(identifier, {
					count: 1,
					resetAt: now + config.windowMs
				});
				return true;
			}

			if (attempt.count >= config.maxAttempts) {
				return false;
			}

			attempt.count++;
			return true;
		},
		reset: (identifier: string): void => {
			attempts.delete(identifier);
		},
		getCount: (identifier: string): number => {
			return attempts.get(identifier)?.count || 0;
		},
		getReset: (identifier: string): number => {
			const attempt = attempts.get(identifier);
			if (!attempt) return 0;
			return Math.max(0, Math.ceil((attempt.resetAt - Date.now()) / 1000));
		}
	};
}

// Pre-configured limiters for common use cases
export const apiRateLimiter = createRateLimiter({
	maxAttempts: 100,
	windowMs: 60 * 1000 // 100 requests per minute
});

export const strictRateLimiter = createRateLimiter({
	maxAttempts: 3,
	windowMs: 60 * 60 * 1000 // 3 attempts per hour
});

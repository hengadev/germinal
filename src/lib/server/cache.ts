/**
 * Response Caching Utilities
 * Provides in-memory LRU cache with automatic expiration
 */

import { LRUCache } from 'lru-cache';

export interface CacheEntry<T> {
	value: T;
	expiresAt: number;
	tags?: string[];
}

export interface CacheOptions {
	ttl?: number; // Time to live in milliseconds
	tags?: string[]; // For cache invalidation
}

export const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
export const MAX_CACHE_SIZE = 500;

/**
 * In-memory LRU cache
 */
export const cache = new LRUCache<string, CacheEntry<unknown>>({
	max: MAX_CACHE_SIZE,
	ttl: DEFAULT_TTL,
});

/**
 * Get cached value if it exists and hasn't expired
 */
export async function getCached<T>(
	key: string,
	fetcher: () => Promise<T>,
	options: CacheOptions = {}
): Promise<T> {
	const cached = cache.get(key);
	const now = Date.now();

	// Return cached value if exists and not expired
	if (cached && cached.expiresAt > now) {
		return cached.value as T;
	}

	// Fetch fresh data
	const value = await fetcher();

	// Store in cache
	cache.set(key, {
		value,
		expiresAt: now + (options.ttl || DEFAULT_TTL),
		tags: options.tags,
	});

	return value;
}

/**
 * Check if key is in cache and not expired
 */
export function isCached(key: string): boolean {
	const cached = cache.get(key);
	if (!cached) return false;

	const now = Date.now();
	return cached.expiresAt > now;
}

/**
 * Delete a specific cache key
 */
export function invalidateCache(key: string): void {
	cache.delete(key);
}

/**
 * Invalidate cache entries by pattern
 * Useful for clearing all events when one event changes
 */
export function invalidateCachePattern(pattern: string): void {
	const keys = cache.keys();
	for (const key of keys) {
		if (key.match(pattern)) {
			cache.delete(key);
		}
	}
}

/**
 * Invalidate cache by tags
 * When a specific tag is cleared, all entries with that tag are cleared
 */
export function invalidateCacheTags(tags: string[]): void {
	const keys = cache.keys();
	for (const key of keys) {
		const entry = cache.get(key);
		if (entry) {
			const entryTags = entry.tags as string[] | undefined;
			if (entryTags && entryTags.some(tag => tags.includes(tag))) {
				cache.delete(key);
			}
		}
	}
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
	return {
		size: cache.size,
		itemCount: cache.size,
		calculatedSize: cache.calculatedSize,
	};
}

/**
 * Clear entire cache
 */
export function clearCache(): void {
	cache.clear();
}

/**
 * Cache tags for common entities
 */
export const CACHE_TAGS = {
	EVENTS: 'events',
	TALENTS: 'talents',
	EVENT_SESSIONS: 'event_sessions',
	RESERVATIONS: 'reservations',
} as const;

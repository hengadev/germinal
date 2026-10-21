/**
 * Minimal in-memory stand-in for the ioredis client the rate-limit module
 * builds at import time. `defineCommand` reproduces the INCR-and-expiry
 * semantics of the module's INCR_AND_EXPIRE_SCRIPT; per-key state lives in
 * `store` / `ttls`. Setting `unavailable = true` makes every command
 * throw, simulating an unreachable Redis.
 *
 * Use from a test file:
 *
 *   vi.mock('ioredis', async () => ({
 *     default: (await import('<relative>/helpers/fake-redis')).FakeRedis,
 *   }));
 */
export class FakeRedis {
	static instance: FakeRedis | undefined;
	store = new Map<string, number>();
	ttls = new Map<string, number>();
	unavailable = false;
	/** The options the module constructed its client with. */
	options: Record<string, unknown>;

	constructor(options: Record<string, unknown> = {}) {
		this.options = options;
		FakeRedis.instance = this;
	}

	on() {}

	defineCommand(name: string) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this as any)[name] = async (key: string, windowSeconds: number) => {
			if (this.unavailable) throw new Error('fake: connection refused');
			const current = (this.store.get(key) ?? 0) + 1;
			this.store.set(key, current);
			if (current === 1) this.ttls.set(key, windowSeconds);
			return current;
		};
	}

	private guard() {
		if (this.unavailable) throw new Error('fake: connection refused');
	}

	async ttl(key: string) {
		this.guard();
		return this.ttls.get(key) ?? -1;
	}

	async get(key: string) {
		this.guard();
		return this.store.has(key) ? String(this.store.get(key)) : null;
	}

	async del(key: string) {
		this.guard();
		this.store.delete(key);
		this.ttls.delete(key);
	}
}

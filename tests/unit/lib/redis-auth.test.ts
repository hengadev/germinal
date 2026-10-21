// @vitest-environment node
//
// Issue 029: every deployed Redis requires a password. The production env
// schema refuses to start without REDIS_PASSWORD, and the rate limiter's
// Redis client connects with it. The production environment used here is
// the compose harness's fixture app.env, so the two stay in sync.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const prodFixture = parse(
	readFileSync(join(repoRoot, 'infrastructure/compose/test/fixtures/prod/env/app.env'), 'utf8')
);

const original = { ...process.env };
afterEach(() => {
	for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
	Object.assign(process.env, original);
	vi.doUnmock('ioredis');
	vi.doUnmock('../../../src/lib/server/env');
	vi.resetModules();
});

function useProductionEnv(overrides: Record<string, string | undefined>) {
	Object.assign(process.env, prodFixture, { NODE_ENV: 'production' });
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	vi.resetModules();
}

describe('Redis password', () => {
	it('the production env schema requires REDIS_PASSWORD', async () => {
		expect(prodFixture.REDIS_PASSWORD, 'the harness fixture sets it').toBeTruthy();

		useProductionEnv({});
		await expect(import('../../../src/lib/server/env')).resolves.toBeDefined();

		useProductionEnv({ REDIS_PASSWORD: undefined });
		await expect(import('../../../src/lib/server/env')).rejects.toThrow(/Invalid environment variables in production/);
	});

	it('the rate limiter connects with the password', async () => {
		vi.doMock('ioredis', async () => ({ default: (await import('../helpers/fake-redis')).FakeRedis }));
		vi.doMock('../../../src/lib/server/env', () => ({
			env: { REDIS_HOST: 'redis', REDIS_PORT: 6379, REDIS_DB: 0, REDIS_PASSWORD: 'fixture-redis-secret' },
			config: { rateLimit: { reservationMaxAttempts: 10, reservationWindowMs: 1, contactFormMaxAttempts: 5, contactFormWindowMs: 1 } },
		}));
		vi.resetModules();
		await import('../../../src/lib/server/rate-limit');
		const { FakeRedis } = await import('../helpers/fake-redis');

		expect(FakeRedis.instance?.options).toMatchObject({ host: 'redis', password: 'fixture-redis-secret' });
	});
});

// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

const KEYS = [
	'NODE_ENV',
	'USE_MOCK_DATA',
	'ALLOW_DEMO_MODE',
	'MOCK_ADMIN_EMAIL',
	'MOCK_ADMIN_PASSWORD',
] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
	for (const k of KEYS) delete process.env[k];
	Object.assign(process.env, values);
	vi.resetModules();
}

afterEach(() => {
	for (const k of KEYS) {
		if (original[k] === undefined) delete process.env[k];
		else process.env[k] = original[k];
	}
	vi.resetModules();
});

const mockAdmin = { MOCK_ADMIN_EMAIL: 'demo@example.com', MOCK_ADMIN_PASSWORD: 'demo-password' };

describe('env: mock data in production', () => {
	it('refuses to start in production with mock data and no demo flag, saying what to do', async () => {
		setEnv({ NODE_ENV: 'production', USE_MOCK_DATA: 'true', ...mockAdmin });

		await expect(import('$lib/server/env')).rejects.toThrow(/ALLOW_DEMO_MODE=true/);
	});

	it('starts as today in production with mock data when ALLOW_DEMO_MODE=true', async () => {
		setEnv({ NODE_ENV: 'production', USE_MOCK_DATA: 'true', ALLOW_DEMO_MODE: 'true', ...mockAdmin });

		const { env } = await import('$lib/server/env');
		expect(env.USE_MOCK_DATA).toBe(true);
		expect(env.MOCK_ADMIN_EMAIL).toBe('demo@example.com');
	});

	it('leaves development with mock data unaffected', async () => {
		setEnv({ NODE_ENV: 'development', USE_MOCK_DATA: 'true', ...mockAdmin });

		const { env } = await import('$lib/server/env');
		expect(env.USE_MOCK_DATA).toBe(true);
	});
});

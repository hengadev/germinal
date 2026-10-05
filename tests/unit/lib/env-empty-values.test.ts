// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

const KEYS = ['MEDIA_URL', 'DATABASE_URL', 'SMTP_FROM_EMAIL'] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
	for (const k of KEYS) {
		if (original[k] === undefined) delete process.env[k];
		else process.env[k] = original[k];
	}
	vi.resetModules();
});

describe('env: empty values count as unset', () => {
	it('drops only empty strings', async () => {
		const { withoutEmptyValues } = await import('$lib/server/env');
		expect(withoutEmptyValues({ A: '', B: 'x', C: ' ' })).toEqual({ B: 'x', C: ' ' });
	});

	it('an empty MEDIA_URL does not invalidate the rest of the environment', async () => {
		// Before: "" failed .url(), and the dev fallback then discarded EVERY
		// value from .env (DATABASE_URL included) for the schema defaults.
		process.env.MEDIA_URL = '';
		process.env.SMTP_FROM_EMAIL = '';
		process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/custom_db';
		vi.resetModules();

		const { env } = await import('$lib/server/env');

		expect(env.MEDIA_URL).toBeUndefined();
		expect(env.SMTP_FROM_EMAIL).toBe('noreply@germinalstudio.co');
		expect(env.DATABASE_URL).toBe('postgresql://u:p@localhost:5432/custom_db');
	});
});

// @vitest-environment node
//
// Guards the "try it" contract of .env.example:
//   1. only try-mode keys may be active (uncommented) in the file, so no
//      placeholder credential can ever switch an integration on, and
//   2. with exactly that file applied to the environment, the integration
//      helpers in src/lib/server/env.ts report everything disabled.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const envExamplePath = join(repoRoot, '.env.example');

/**
 * Keys .env.example may set: exactly what `make try` needs, nothing more.
 * Only local containers qualify (S3_* is the docker-compose MinIO).
 */
const TRY_MODE_KEYS = new Set([
	'DATABASE_URL',
	'REDIS_HOST',
	'REDIS_PORT',
	'S3_ENDPOINT',
	'S3_ACCESS_KEY_ID',
	'S3_SECRET_ACCESS_KEY',
	'S3_BUCKET_NAME',
	'S3_PUBLIC_URL',
	'ADMIN_EMAIL',
	'ADMIN_PASSWORD',
	'ADMIN_FIRST_NAME',
	'ADMIN_LAST_NAME'
]);

/** Every key the dev env schema reads (keep in sync with src/lib/server/env.ts). */
const SCHEMA_KEYS = [
	'DATABASE_URL',
	'REDIS_HOST',
	'REDIS_PORT',
	'USE_MOCK_DATA',
	'MOCK_ADMIN_EMAIL',
	'MOCK_ADMIN_PASSWORD',
	'MOCK_STAFF_EMAIL',
	'MOCK_STAFF_PASSWORD',
	'AWS_REGION',
	'AWS_ACCESS_KEY_ID',
	'AWS_SECRET_ACCESS_KEY',
	'S3_ENDPOINT',
	'S3_ACCESS_KEY_ID',
	'S3_SECRET_ACCESS_KEY',
	'S3_BUCKET_NAME',
	'S3_PUBLIC_URL',
	'MEDIA_URL',
	'MAX_FILE_SIZE',
	'ALLOWED_IMAGE_TYPES',
	'ALLOWED_VIDEO_TYPES',
	'SMTP_HOST',
	'SMTP_PORT',
	'SMTP_SECURE',
	'SMTP_USER',
	'SMTP_PASSWORD',
	'SMTP_FROM_EMAIL',
	'SMTP_FROM_NAME',
	'CONTACT_EMAIL',
	'STRIPE_SECRET_KEY',
	'STRIPE_WEBHOOK_SECRET',
	'PUBLIC_STRIPE_PUBLISHABLE_KEY',
	'PUBLIC_URL',
	'RESERVATION_EXPIRY_MINUTES',
	'SENTRY_DSN',
	'USE_SCHEDULER',
	'TWILIO_ACCOUNT_SID',
	'TWILIO_API_KEY_SID',
	'TWILIO_API_KEY_SECRET',
	'TWILIO_PHONE_NUMBER',
	'NODE_ENV'
] as const;

let savedEnv: Record<string, string | undefined> = {};
let emptyEnvFile: string;
let envModule: typeof import('../../../src/lib/server/env');

beforeAll(async () => {
	const parsed = parse(readFileSync(envExamplePath, 'utf8'));

	// Scrub everything the env schema reads (plus whatever the example sets)
	// from process.env, then apply exactly the example's active values.
	const scrub = new Set<string>([...SCHEMA_KEYS, ...Object.keys(parsed)]);
	for (const key of scrub) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
	for (const [key, value] of Object.entries(parsed)) {
		process.env[key] = value;
	}

	// env.ts runs `import 'dotenv/config'`, which would load the developer's
	// real .env from the repo root. Point dotenv at an empty file instead so
	// only the values applied above are in play.
	emptyEnvFile = join(mkdtempSync(join(tmpdir(), 'germinal-env-example-')), 'empty.env');
	writeFileSync(emptyEnvFile, '');
	savedEnv.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH;
	process.env.DOTENV_CONFIG_PATH = emptyEnvFile;

	vi.resetModules();
	envModule = await import('../../../src/lib/server/env');
});

afterAll(() => {
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	savedEnv = {};
	unlinkSync(emptyEnvFile);
	vi.resetModules();
});

describe('.env.example (try mode)', () => {
	it('only activates try-mode keys — no integration placeholder is set', () => {
		const parsed = parse(readFileSync(envExamplePath, 'utf8'));
		const active = Object.keys(parsed);

		expect(active).toContain('DATABASE_URL');
		for (const key of active) {
			expect(TRY_MODE_KEYS).toContain(key);
		}
	});

	it('keeps Stripe and AWS (SES) disabled with the unmodified file', () => {
		expect(envModule.isStripeEnabled()).toBe(false);
		expect(envModule.isAWSConfigured()).toBe(false);
	});

	it('enables S3 against the local MinIO only', () => {
		expect(envModule.isS3Enabled()).toBe(true);
		expect(envModule.env.S3_ENDPOINT).toBe('http://localhost:9000');
		expect(envModule.getMediaBaseUrl()).toMatch(/^http:\/\/localhost:9000\//);
	});
});

// @vitest-environment node
//
// S3 client construction: real AWS by default, any S3-compatible endpoint
// (MinIO locally) when S3_ENDPOINT is set. S3 has its own credentials so a
// local MinIO login never switches SES email on.
import { describe, it, expect, vi, afterEach } from 'vitest';

const KEYS = [
	'AWS_REGION',
	'AWS_ACCESS_KEY_ID',
	'AWS_SECRET_ACCESS_KEY',
	'S3_ENDPOINT',
	'S3_ACCESS_KEY_ID',
	'S3_SECRET_ACCESS_KEY'
] as const;
type Key = (typeof KEYS)[number];
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

/**
 * Sets every S3/AWS key: unlisted ones to '' (unset), so the developer's
 * real .env (loaded by `dotenv/config`) can't leak into the test.
 */
async function load(values: Partial<Record<Key, string>>) {
	for (const k of KEYS) process.env[k] = values[k] ?? '';
	vi.resetModules();
	const env = await import('$lib/server/env');
	const s3 = await import('$lib/server/services/s3');
	return { ...env, ...s3 };
}

afterEach(() => {
	for (const k of KEYS) {
		if (original[k] === undefined) delete process.env[k];
		else process.env[k] = original[k];
	}
	vi.resetModules();
});

describe('S3 client config', () => {
	it('targets AWS with the AWS_* credentials when no endpoint is set', async () => {
		const { getS3ClientConfig, isS3Enabled } = await load({
			AWS_REGION: 'eu-west-3',
			AWS_ACCESS_KEY_ID: 'aws-id',
			AWS_SECRET_ACCESS_KEY: 'aws-secret'
		});

		expect(isS3Enabled()).toBe(true);
		const config = getS3ClientConfig();
		expect(config.region).toBe('eu-west-3');
		expect(config.credentials).toEqual({ accessKeyId: 'aws-id', secretAccessKey: 'aws-secret' });
		expect(config.endpoint).toBeUndefined();
		expect(config.forcePathStyle).toBeUndefined();
	});

	it('targets S3_ENDPOINT path-style when set (MinIO)', async () => {
		const { getS3ClientConfig } = await load({
			S3_ENDPOINT: 'http://localhost:9000',
			S3_ACCESS_KEY_ID: 'minio-id',
			S3_SECRET_ACCESS_KEY: 'minio-secret'
		});

		const config = getS3ClientConfig();
		expect(config.endpoint).toBe('http://localhost:9000');
		expect(config.forcePathStyle).toBe(true);
		expect(config.credentials).toEqual({ accessKeyId: 'minio-id', secretAccessKey: 'minio-secret' });
	});

	it('prefers S3_* credentials over AWS_*', async () => {
		const { getS3ClientConfig } = await load({
			AWS_ACCESS_KEY_ID: 'aws-id',
			AWS_SECRET_ACCESS_KEY: 'aws-secret',
			S3_ACCESS_KEY_ID: 's3-id',
			S3_SECRET_ACCESS_KEY: 's3-secret'
		});

		expect(getS3ClientConfig().credentials).toEqual({ accessKeyId: 's3-id', secretAccessKey: 's3-secret' });
	});

	it('never mixes a half-set S3_* pair with AWS_*', async () => {
		const { getS3ClientConfig } = await load({
			AWS_ACCESS_KEY_ID: 'aws-id',
			AWS_SECRET_ACCESS_KEY: 'aws-secret',
			S3_ACCESS_KEY_ID: 's3-id'
		});

		expect(getS3ClientConfig().credentials).toEqual({ accessKeyId: 'aws-id', secretAccessKey: 'aws-secret' });
	});

	it('S3_* credentials enable S3 but leave SES (AWS) unconfigured', async () => {
		const { isS3Enabled, isAWSConfigured } = await load({
			S3_ENDPOINT: 'http://localhost:9000',
			S3_ACCESS_KEY_ID: 'minio-id',
			S3_SECRET_ACCESS_KEY: 'minio-secret'
		});

		expect(isS3Enabled()).toBe(true);
		expect(isAWSConfigured()).toBe(false);
	});

	it('S3 is disabled with no credentials at all', async () => {
		const { isS3Enabled, getS3ClientConfig } = await load({});

		expect(isS3Enabled()).toBe(false);
		expect(() => getS3ClientConfig()).toThrow(/S3 is not configured/);
	});
});

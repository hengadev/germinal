// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
	checkSeedGuard,
	databaseHost,
	isLoopbackHost
} from '../../../scripts/seed-guard';

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5432/germinal';

describe('checkSeedGuard', () => {
	describe('accepts local development environments', () => {
		it('accepts the default local database with NODE_ENV unset', () => {
			expect(checkSeedGuard({ nodeEnv: undefined, databaseUrl: LOCAL_URL })).toEqual({
				allowed: true
			});
		});

		it('accepts NODE_ENV=development', () => {
			expect(checkSeedGuard({ nodeEnv: 'development', databaseUrl: LOCAL_URL })).toEqual({
				allowed: true
			});
		});

		it('accepts NODE_ENV=test (not a deploy environment)', () => {
			expect(checkSeedGuard({ nodeEnv: 'test', databaseUrl: LOCAL_URL })).toEqual({
				allowed: true
			});
		});

		it('accepts the loopback IP even though the database is named germinal', () => {
			// The old guard rejected any URL containing "germinal"; the local
			// default database is called germinal, so it must not be a signal.
			expect(
				checkSeedGuard({
					nodeEnv: 'development',
					databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5432/germinal'
				})
			).toEqual({ allowed: true });
		});

		it('accepts the IPv6 loopback address', () => {
			expect(
				checkSeedGuard({ nodeEnv: undefined, databaseUrl: 'postgresql://user:pass@[::1]:5432/db' })
			).toEqual({ allowed: true });
		});

		it('treats NODE_ENV case-insensitively when accepting', () => {
			expect(checkSeedGuard({ nodeEnv: 'Development', databaseUrl: LOCAL_URL })).toEqual({
				allowed: true
			});
		});
	});

	describe('refuses production- and staging-shaped environments', () => {
		it('refuses NODE_ENV=production even with a loopback database', () => {
			expect(checkSeedGuard({ nodeEnv: 'production', databaseUrl: LOCAL_URL })).toEqual({
				allowed: false,
				reason: 'node-env'
			});
		});

		it('refuses NODE_ENV=staging even with a loopback database', () => {
			expect(checkSeedGuard({ nodeEnv: 'staging', databaseUrl: LOCAL_URL })).toEqual({
				allowed: false,
				reason: 'node-env'
			});
		});

		it('refuses NODE_ENV case variants', () => {
			expect(checkSeedGuard({ nodeEnv: 'Production', databaseUrl: LOCAL_URL })).toEqual({
				allowed: false,
				reason: 'node-env'
			});
			expect(checkSeedGuard({ nodeEnv: ' STAGING ', databaseUrl: LOCAL_URL })).toEqual({
				allowed: false,
				reason: 'node-env'
			});
		});

		it('refuses a remote host even when the database is named germinal', () => {
			expect(
				checkSeedGuard({
					nodeEnv: 'development',
					databaseUrl: 'postgresql://user:pass@db.prod.example.com:5432/germinal'
				})
			).toEqual({ allowed: false, reason: 'database-url' });
		});

		it('refuses the production VPS IP', () => {
			expect(
				checkSeedGuard({
					nodeEnv: 'development',
					databaseUrl: 'postgresql://germinal:secret@46.225.25.238:5432/germinal'
				})
			).toEqual({ allowed: false, reason: 'database-url' });
		});

		it('refuses staging-shaped hostnames', () => {
			expect(
				checkSeedGuard({
					nodeEnv: undefined,
					databaseUrl: 'postgresql://user:pass@staging-db.internal:5432/germinal_staging'
				})
			).toEqual({ allowed: false, reason: 'database-url' });
		});

		it('refuses private-network and container-service hosts', () => {
			for (const host of ['10.0.0.5', '192.168.1.10', 'db', 'postgres']) {
				expect(
					checkSeedGuard({
						nodeEnv: 'development',
						databaseUrl: `postgresql://user:pass@${host}:5432/germinal`
					})
				).toEqual({ allowed: false, reason: 'database-url' });
			}
		});

		it('refuses hosts that merely start with localhost', () => {
			expect(
				checkSeedGuard({
					nodeEnv: 'development',
					databaseUrl: 'postgresql://user:pass@localhost.evil.example:5432/db'
				})
			).toEqual({ allowed: false, reason: 'database-url' });
		});

		it('refuses when DATABASE_URL is missing or malformed', () => {
			expect(checkSeedGuard({ nodeEnv: 'development', databaseUrl: undefined })).toEqual({
				allowed: false,
				reason: 'database-url'
			});
			expect(checkSeedGuard({ nodeEnv: undefined, databaseUrl: 'not a url' })).toEqual({
				allowed: false,
				reason: 'database-url'
			});
		});
	});
});

describe('databaseHost', () => {
	it('returns the lowercased host, stripping IPv6 brackets', () => {
		expect(databaseHost('postgresql://u:p@LocalHost:5432/db')).toBe('localhost');
		expect(databaseHost('postgresql://u:p@[::1]:5432/db')).toBe('::1');
	});

	it('returns null for missing or unparseable URLs', () => {
		expect(databaseHost(undefined)).toBeNull();
		expect(databaseHost('::::')).toBeNull();
	});
});

describe('isLoopbackHost', () => {
	it('accepts only localhost, ::1 and 127.0.0.0/8', () => {
		expect(isLoopbackHost('localhost')).toBe(true);
		expect(isLoopbackHost('::1')).toBe(true);
		expect(isLoopbackHost('127.0.0.1')).toBe(true);
		expect(isLoopbackHost('127.255.255.255')).toBe(true);
		expect(isLoopbackHost('128.0.0.1')).toBe(false);
		expect(isLoopbackHost('localhost.example.com')).toBe(false);
		expect(isLoopbackHost('10.0.0.1')).toBe(false);
	});
});

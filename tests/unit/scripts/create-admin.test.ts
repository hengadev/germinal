// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	resolveAdminConfig,
	AdminBootstrapError,
	MIN_PASSWORD_LENGTH,
} from '../../../scripts/create-admin.js';

// Valid operator-specified values, as they would arrive from admin.env
// (rendered from the Infisical /admin folder).
const VALID = {
	ADMIN_EMAIL: 'operator@germinalstudio.co',
	ADMIN_PASSWORD: 'correct-horse-battery-staple',
	ADMIN_FIRST_NAME: 'Ophélia',
	ADMIN_LAST_NAME: 'Dumas',
};

describe('resolveAdminConfig', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('passes through provided values', () => {
		const config = resolveAdminConfig({ NODE_ENV: 'development', ...VALID });

		expect(config).toEqual({
			email: VALID.ADMIN_EMAIL,
			password: VALID.ADMIN_PASSWORD,
			firstName: VALID.ADMIN_FIRST_NAME,
			lastName: VALID.ADMIN_LAST_NAME,
			strict: false,
		});
	});

	it('applies the demo defaults in local development when values are missing', () => {
		const config = resolveAdminConfig({ NODE_ENV: 'development' });

		expect(config).toEqual({
			email: 'admin@germinal.com',
			password: 'changeme123',
			firstName: 'Admin',
			lastName: 'User',
			strict: false,
		});
	});

	it('fills in only the missing values in local development', () => {
		const config = resolveAdminConfig({
			NODE_ENV: 'development',
			ADMIN_EMAIL: 'me@localhost',
		});

		expect(config.email).toBe('me@localhost');
		expect(config.password).toBe('changeme123');
	});

	it('exposes the app minimum password length (8)', () => {
		expect(MIN_PASSWORD_LENGTH).toBe(8);
	});

	describe('production refusal', () => {
		it('refuses to run when values are missing', () => {
			expect(() => resolveAdminConfig({ NODE_ENV: 'production' })).toThrow(AdminBootstrapError);
			expect(() => resolveAdminConfig({ NODE_ENV: 'production' })).toThrow(/ADMIN_EMAIL/);
		});

		it('names every missing value', () => {
			expect(() =>
				resolveAdminConfig({ NODE_ENV: 'production', ADMIN_EMAIL: VALID.ADMIN_EMAIL })
			).toThrow(/ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME/);
		});

		it('treats empty and whitespace-only values as missing', () => {
			expect(() =>
				resolveAdminConfig({
					NODE_ENV: 'production',
					...VALID,
					ADMIN_EMAIL: '',
					ADMIN_LAST_NAME: '   ',
				})
			).toThrow(AdminBootstrapError);
		});

		it('refuses a password shorter than the app minimum', () => {
			expect(() =>
				resolveAdminConfig({
					NODE_ENV: 'production',
					...VALID,
					ADMIN_PASSWORD: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
				})
			).toThrow(AdminBootstrapError);

			expect(() =>
				resolveAdminConfig({
					NODE_ENV: 'production',
					...VALID,
					ADMIN_PASSWORD: 'a'.repeat(MIN_PASSWORD_LENGTH),
				})
			).not.toThrow();
		});

		it('accepts complete values in production', () => {
			const config = resolveAdminConfig({ NODE_ENV: 'production', ...VALID });

			expect(config.email).toBe(VALID.ADMIN_EMAIL);
			expect(config.strict).toBe(true);
		});

		it('is equally strict in staging', () => {
			expect(() => resolveAdminConfig({ NODE_ENV: 'staging' })).toThrow(AdminBootstrapError);
			expect(() =>
				resolveAdminConfig({ NODE_ENV: 'staging', ...VALID, ADMIN_PASSWORD: 'short' })
			).toThrow(AdminBootstrapError);
			expect(() => resolveAdminConfig({ NODE_ENV: 'staging', ...VALID })).not.toThrow();
		});
	});
});

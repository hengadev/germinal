// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import postgres from 'postgres';
import * as argon2 from 'argon2';
import {
	resolveAdminConfig,
	bootstrapAdmin,
	AdminBootstrapError,
} from '../../scripts/create-admin.js';
import { TEST_DATABASE_URL } from '../fixtures/database';

// A dedicated short-lived client, like the script's own: the bootstrap is a
// one-off process, not part of the app's pool.
const client = postgres(TEST_DATABASE_URL, { max: 1, prepare: false });

const DEMO = {
	ADMIN_EMAIL: 'bootstrap-admin@germinal.com',
	ADMIN_PASSWORD: 'demo-bootstrap-password',
	ADMIN_FIRST_NAME: 'Boot',
	ADMIN_LAST_NAME: 'Strap',
};

function devConfig(overrides = {}) {
	return resolveAdminConfig({ NODE_ENV: 'development', ...DEMO, ...overrides });
}

async function getUser(email: string) {
	const [row] = await client`select * from users where email = ${email}`;
	return row;
}

beforeEach(async () => {
	// sessions references users; TRUNCATE ... CASCADE clears both sides.
	await client`truncate table users cascade`;
});

afterAll(async () => {
	await client`truncate table users cascade`;
	await client.end({ timeout: 5 });
});

describe('admin bootstrap', () => {
	it('creates the admin with the given values on an empty database', async () => {
		const config = devConfig();
		const result = await bootstrapAdmin(client, config);

		expect(result.created).toBe(true);
		expect(result.email).toBe(DEMO.ADMIN_EMAIL);

		const user = await getUser(DEMO.ADMIN_EMAIL);
		expect(user).toBeDefined();
		expect(user.role).toBe('admin');
		expect(user.first_name).toBe(DEMO.ADMIN_FIRST_NAME);
		expect(user.last_name).toBe(DEMO.ADMIN_LAST_NAME);

		// The stored hash must verify against the given password, exactly like
		// the app's login flow does (argon2 against users.password_hash).
		expect(await argon2.verify(user.password_hash, DEMO.ADMIN_PASSWORD)).toBe(true);
	});

	it('makes no change on a second run, including when ADMIN_PASSWORD has changed since', async () => {
		const first = await bootstrapAdmin(client, devConfig());
		expect(first.created).toBe(true);

		const userBefore = await getUser(DEMO.ADMIN_EMAIL);

		// Redeploy with a different password in admin.env: the existing
		// account must not be modified (no password reset on redeploy).
		const second = await bootstrapAdmin(client, devConfig({ ADMIN_PASSWORD: 'rotated-password-456' }));
		expect(second.created).toBe(false);

		const userAfter = await getUser(DEMO.ADMIN_EMAIL);
		expect(userAfter.password_hash).toBe(userBefore.password_hash);
		expect(userAfter.updated_at).toEqual(userBefore.updated_at);

		// The original password still logs in; the rotated one does not.
		expect(await argon2.verify(userAfter.password_hash, DEMO.ADMIN_PASSWORD)).toBe(true);
		expect(await argon2.verify(userAfter.password_hash, 'rotated-password-456')).toBe(false);
	});

	it('leaves an existing non-admin account with the same email untouched', async () => {
		// e.g. the operator previously created a staff account with that email.
		await client`
			insert into users (email, first_name, last_name, password_hash, role)
			values (${DEMO.ADMIN_EMAIL}, 'Existing', 'User', 'not-a-real-hash', 'staff')`;

		const result = await bootstrapAdmin(client, devConfig());

		expect(result.created).toBe(false);
		const user = await getUser(DEMO.ADMIN_EMAIL);
		expect(user.role).toBe('staff');
		expect(user.password_hash).toBe('not-a-real-hash');
	});

	it('refuses in production mode and creates no account', async () => {
		// Missing values.
		expect(() => resolveAdminConfig({ NODE_ENV: 'production' })).toThrow(AdminBootstrapError);
		// Too-short password.
		expect(() =>
			resolveAdminConfig({
				NODE_ENV: 'production',
				...DEMO,
				ADMIN_PASSWORD: 'short',
			})
		).toThrow(AdminBootstrapError);

		// Validation happens before any database access, so nothing was created.
		const rows = await client`select count(*)::int as count from users`;
		expect(rows[0].count).toBe(0);
	});
});

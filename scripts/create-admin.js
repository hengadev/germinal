#!/usr/bin/env node
/**
 * Admin account bootstrap.
 *
 * Creates the first admin user from operator-specified values:
 * ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME.
 *
 * Shipped in the production image next to migrate.js and run as a one-off
 * bootstrap service after migrations on every deploy (PRD module M7). The
 * values come from the Infisical `/admin` folder, rendered by the Agent into
 * its own admin.env, which only the one-off bootstrap service loads — the
 * long-running app container never receives ADMIN_PASSWORD.
 *
 * Plain Node ESM on production dependencies only (postgres, argon2), so it
 * runs inside the image without tsx or the TypeScript sources.
 *
 * - Idempotent: creates the admin only if no user with ADMIN_EMAIL exists,
 *   and never modifies an existing account (no password reset on redeploy).
 * - Outside local development (NODE_ENV=production or staging) missing values
 *   or a password shorter than the app's minimum exit non-zero and create
 *   nothing. The insecure defaults remain only for local development.
 */
import 'dotenv/config'; // no-op inside the image (no .env there); local dev reads .env
import * as argon2 from 'argon2';
import postgres from 'postgres';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Must stay in sync with the app's minimum (admin team endpoints, change-
// and reset-password pages all enforce 8).
export const MIN_PASSWORD_LENGTH = 8;

// NOTE: germinal.com is a fake domain reserved for system/bootstrap accounts.
// Team-creation endpoints reject it (src/routes/api/admin/team/*), so it can
// never be confused with a real staff account. Real staff use their own
// address. These defaults exist ONLY for local development.
const DEV_DEFAULTS = {
	email: 'admin@germinal.com',
	password: 'changeme123',
	firstName: 'Admin',
	lastName: 'User',
};

const ADMIN_KEYS = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_FIRST_NAME', 'ADMIN_LAST_NAME'];

export class AdminBootstrapError extends Error {
	/**
	 * @param {string} message
	 */
	constructor(message) {
		super(message);
		this.name = 'AdminBootstrapError';
	}
}

/**
 * @param {string | undefined} value
 * @returns {value is string}
 */
function isSet(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Resolve the admin bootstrap values from an environment.
 *
 * In production/staging every value is required and the password must meet
 * the app's minimum length; anything else throws AdminBootstrapError before
 * any database access happens. In local development, missing values fall
 * back to the insecure demo defaults.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ email: string, password: string, firstName: string, lastName: string, strict: boolean }}
 */
export function resolveAdminConfig(env = process.env) {
	const strict = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';

	const email = env.ADMIN_EMAIL;
	const password = env.ADMIN_PASSWORD;
	const firstName = env.ADMIN_FIRST_NAME;
	const lastName = env.ADMIN_LAST_NAME;

	if (strict) {
		if (!isSet(email) || !isSet(password) || !isSet(firstName) || !isSet(lastName)) {
			const missing = ADMIN_KEYS.filter((key) => !isSet(env[key]));
			throw new AdminBootstrapError(
				`missing required values: ${missing.join(', ')}. ` +
					`They belong in the Infisical /admin folder (rendered to admin.env for the bootstrap service only). ` +
					`Refusing to run in NODE_ENV=${env.NODE_ENV}.`
			);
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			throw new AdminBootstrapError(
				`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters ` +
					`(got ${password.length}).`
			);
		}
		return { email, password, firstName, lastName, strict };
	}

	const missing = ADMIN_KEYS.filter((key) => !isSet(env[key]));
	if (missing.length > 0) {
		console.warn(`[admin-bootstrap] Using development defaults for: ${missing.join(', ')}`);
	}
	return {
		email: email || DEV_DEFAULTS.email,
		password: password || DEV_DEFAULTS.password,
		firstName: firstName || DEV_DEFAULTS.firstName,
		lastName: lastName || DEV_DEFAULTS.lastName,
		strict,
	};
}

/**
 * Create the admin account if it does not exist yet.
 *
 * Never touches an existing account: when a user with the email is already
 * present (or was inserted concurrently — unique-violation 23505), nothing is
 * written and { created: false } is returned.
 *
 * @param {import('postgres').Sql} client
 * @param {{ email: string, password: string, firstName: string, lastName: string }} config
 * @returns {Promise<{ created: boolean, email: string, id?: string }>}
 */
export async function bootstrapAdmin(client, config) {
	const existing = await client`select id from users where email = ${config.email} limit 1`;
	if (existing.length > 0) {
		return { created: false, email: config.email };
	}

	const passwordHash = await argon2.hash(config.password);

	try {
		const [admin] = await client`
			insert into users (email, first_name, last_name, password_hash, role)
			values (${config.email}, ${config.firstName}, ${config.lastName}, ${passwordHash}, 'admin')
			returning id, email`;
		return { created: true, email: admin.email, id: admin.id };
	} catch (err) {
		if (err && typeof err === 'object' && /** @type {{ code?: string }} */ (err).code === '23505') {
			// Created concurrently between our check and the insert — same outcome.
			return { created: false, email: config.email };
		}
		throw err;
	}
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error('[admin-bootstrap] ERROR: DATABASE_URL environment variable is not set');
		process.exit(1);
	}

	let config;
	try {
		config = resolveAdminConfig();
	} catch (err) {
		console.error(`[admin-bootstrap] ❌ ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	}

	console.log('[admin-bootstrap] Connecting to database...');
	const client = postgres(databaseUrl, { max: 1, prepare: false });

	try {
		const result = await bootstrapAdmin(client, config);
		if (result.created) {
			console.log(`[admin-bootstrap] ✅ Admin account created: ${result.email} (role=admin)`);
			console.log('[admin-bootstrap] ⚠️  IMPORTANT: change this password after first login.');
		} else {
			console.log(
				`[admin-bootstrap] Admin account already exists: ${result.email} — leaving it unchanged.`
			);
		}
	} catch (err) {
		console.error('[admin-bootstrap] ❌ Admin bootstrap failed:', err);
		process.exit(1);
	} finally {
		await client.end({ timeout: 5 });
	}
}

// Run only when executed directly (node scripts/create-admin.js), not when
// imported by tests.
const invokedAs = process.argv[1];
if (invokedAs && import.meta.url === pathToFileURL(resolve(invokedAs)).href) {
	main();
}

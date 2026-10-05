/**
 * Guard for destructive local-development scripts (currently `seed.ts`).
 *
 * The seed script deletes ALL events, talents and categories before
 * inserting demo content, so it must never run against anything but a
 * local database. The old guard rejected any `DATABASE_URL` *containing*
 * the substring "germinal" — which is also the name of the default local
 * database, so the guard blocked the very machine it was meant to protect.
 *
 * Instead of guessing from the database name, we require a positive
 * local-development signal:
 *
 *   1. `NODE_ENV` is unset, "development" or anything else that is not
 *      "production" / "staging", AND
 *   2. the `DATABASE_URL` host is a loopback address (localhost,
 *      127.0.0.0/8, ::1).
 *
 * Staging- and production-shaped URLs (remote hosts, VPS IPs, private
 * network addresses, container service names) are rejected even when the
 * database happens to be called "germinal".
 */

export type SeedGuardInput = {
	nodeEnv?: string | undefined;
	databaseUrl?: string | undefined;
};

export type SeedGuardVerdict =
	| { allowed: true }
	| { allowed: false; reason: 'node-env' | 'database-url' };

const NON_SEEDABLE_NODE_ENVS = new Set(['production', 'staging']);

/** Extract the (bracket-stripped, lowercased) host from a connection string. */
export function databaseHost(databaseUrl: string | undefined): string | null {
	if (!databaseUrl) return null;
	try {
		const { hostname } = new URL(databaseUrl);
		// WHATWG URL keeps brackets on IPv6 hosts ("[::1]"); strip them so
		// callers compare against "::1".
		return hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
	} catch {
		return null;
	}
}

/** True only for loopback hosts: localhost, 127.0.0.0/8 and ::1. */
export function isLoopbackHost(hostname: string): boolean {
	if (hostname === 'localhost' || hostname === '::1') return true;
	return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/**
 * Decide whether a destructive seed may run for the given environment.
 * Both sides of this check (local accepted; production/staging-shaped
 * rejected) are covered by tests/unit/scripts/seed-guard.test.ts.
 */
export function checkSeedGuard(input: SeedGuardInput): SeedGuardVerdict {
	const nodeEnv = input.nodeEnv?.trim().toLowerCase();
	if (nodeEnv && NON_SEEDABLE_NODE_ENVS.has(nodeEnv)) {
		return { allowed: false, reason: 'node-env' };
	}

	const host = databaseHost(input.databaseUrl);
	if (!host || !isLoopbackHost(host)) {
		return { allowed: false, reason: 'database-url' };
	}

	return { allowed: true };
}

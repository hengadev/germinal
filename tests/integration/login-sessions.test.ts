// @vitest-environment node
//
// Issue 020 — Admin/Staff login sessions are stored only as SHA-256 hashes
// of their tokens, and revoked when a password changes, a reset completes or
// an account is deactivated. Real test database; the db module is swapped
// for the fixture's client.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { eq, like } from 'drizzle-orm';
import { sessions, users } from '../../src/lib/server/db/schema';
import { getTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';

const testDb = getTestDatabase();

vi.mock('../../src/lib/server/env', () => ({
	env: { DATABASE_URL: TEST_DATABASE_URL, USE_MOCK_DATA: false },
	isDevelopment: () => true,
}));

vi.mock('../../src/lib/server/db', () => ({
	db: testDb,
	runMigrations: vi.fn(),
	withTimeout: vi.fn(),
	getQueryStats: vi.fn(),
}));

type Session = typeof import('../../src/lib/server/session');
let store: Session;
let hashPassword: (password: string) => Promise<string>;

beforeAll(async () => {
	store = await import('../../src/lib/server/session');
	({ hashPassword } = await import('../../src/lib/server/auth'));
});

const EMAIL_PREFIX = 'login-sessions-test-';

async function cleanUsers() {
	await testDb.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
}

beforeEach(cleanUsers);
afterAll(async () => {
	await cleanUsers();
	await closeTestDatabase();
});

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

async function seedUser(role: 'admin' | 'staff', password = 'old-password-123', extra: Partial<typeof users.$inferInsert> = {}) {
	const [user] = await testDb
		.insert(users)
		.values({
			email: `${EMAIL_PREFIX}${role}-${Math.random().toString(36).slice(2, 8)}@example.com`,
			firstName: 'Test',
			lastName: role,
			passwordHash: await hashPassword(password),
			role,
			...extra,
		})
		.returning();
	return user;
}

async function storedSessionIds(userId: string) {
	const rows = await testDb.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
	return rows.map((row) => row.id).sort();
}

describe('login session store', () => {
	it('persists only the hash of the token, and looks sessions up by the raw token', async () => {
		const user = await seedUser('admin');
		const { id: token } = await store.createSession(user.id);

		expect(await storedSessionIds(user.id)).toEqual([sha256(token)]);
		expect((await store.validateSession(token))?.id).toBe(user.id);
		// The stored value itself is not a working token.
		expect(await store.validateSession(sha256(token))).toBeNull();
	});

	it('logout deletes the hashed row', async () => {
		const user = await seedUser('staff');
		const { id: token } = await store.createSession(user.id);

		await store.deleteSession(token);

		expect(await storedSessionIds(user.id)).toEqual([]);
		expect(await store.validateSession(token)).toBeNull();
	});

	it('revokes all of a user’s sessions except one, leaving other users alone', async () => {
		const user = await seedUser('admin');
		const other = await seedUser('admin');
		const keep = (await store.createSession(user.id)).id;
		const drop1 = (await store.createSession(user.id)).id;
		const drop2 = (await store.createSession(user.id)).id;
		const otherToken = (await store.createSession(other.id)).id;

		await store.revokeUserSessions(user.id, { except: keep });

		expect(await storedSessionIds(user.id)).toEqual([sha256(keep)]);
		expect(await store.validateSession(drop1)).toBeNull();
		expect(await store.validateSession(drop2)).toBeNull();
		expect((await store.validateSession(otherToken))?.id).toBe(other.id);

		await store.revokeUserSessions(user.id);
		expect(await storedSessionIds(user.id)).toEqual([]);
	});
});

describe('revocation', () => {
	it('a password change revokes the user’s other sessions and keeps the current one', async () => {
		const user = await seedUser('admin');
		const current = (await store.createSession(user.id)).id;
		const stolen = (await store.createSession(user.id)).id;
		const { actions } = await import('../../src/routes/(admin)/admin/change-password/+page.server');

		const form = new FormData();
		form.set('currentPassword', 'old-password-123');
		form.set('newPassword', 'new-password-456');
		form.set('confirmPassword', 'new-password-456');
		const result = await actions.default({
			request: new Request('http://admin.localhost/admin/change-password', { method: 'POST', body: form }),
			locals: { user: { id: user.id, email: user.email, role: 'admin' } },
			cookies: { get: (name: string) => (name === 'session' ? current : undefined) },
			url: new URL('http://admin.localhost/admin/change-password'),
		} as any);

		expect(result).toMatchObject({ success: true });
		expect((await store.validateSession(current))?.id).toBe(user.id);
		expect(await store.validateSession(stolen)).toBeNull();
	});

	it.each([
		['Admin', '../../src/routes/(auth)/admin/reset-password/[token]/+page.server', 'admin'],
		['Staff', '../../src/routes/(staff)/staff/reset-password/[token]/+page.server', 'staff'],
	] as const)('completing a %s reset revokes all the user’s sessions', async (_label, modulePath, role) => {
		const token = `reset-${Math.random().toString(36).slice(2)}`;
		const user = await seedUser(role, 'old-password-123', {
			passwordResetToken: token,
			passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
		});
		const a = (await store.createSession(user.id)).id;
		const b = (await store.createSession(user.id)).id;
		const { actions } = await import(/* @vite-ignore */ modulePath);

		const form = new FormData();
		form.set('newPassword', 'brand-new-pass-789');
		form.set('confirmPassword', 'brand-new-pass-789');
		const result = await actions.default({
			request: new Request('http://localhost/reset', { method: 'POST', body: form }),
			params: { token },
			locals: {},
		} as any);

		expect(result).toHaveProperty('success');
		expect(await store.validateSession(a)).toBeNull();
		expect(await store.validateSession(b)).toBeNull();
	});

	it.each(['admin', 'staff'] as const)('deactivating a %s revokes all their sessions', async (role) => {
		const target = await seedUser(role);
		const caller = await seedUser('admin');
		const token = (await store.createSession(target.id)).id;
		const callerToken = (await store.createSession(caller.id)).id;
		const { POST } = await import(`../../src/routes/api/admin/team/${role}/deactivate/+server.ts`);

		const form = new FormData();
		form.set(role === 'admin' ? 'adminId' : 'staffId', target.id);
		const response = await POST({
			request: new Request('http://admin.localhost/api', { method: 'POST', body: form }),
			locals: { user: { id: caller.id, email: caller.email, role: 'admin' } },
		} as any);

		expect(response.status).toBe(200);
		expect(await store.validateSession(token)).toBeNull();
		expect((await store.validateSession(callerToken))?.id).toBe(caller.id);
	});
});

// ---------------------------------------------------------------------------
// Migration: replays every migration before it in an isolated schema.
// ---------------------------------------------------------------------------

describe('0035_hashed_login_sessions migration', () => {
	const SCHEMA = 'test_migration_hashed_login_sessions';
	const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
	const client = postgres(TEST_DATABASE_URL, { max: 1 });

	async function apply(tag: string) {
		const statements = (await readFile(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8'))
			.split('--> statement-breakpoint')
			.map((statement) => statement.trim())
			.filter((statement) => statement.length > 0);
		for (const raw of statements) {
			await client.unsafe(
				raw
					.replace(/"public"\./g, `"${SCHEMA}".`)
					.replace(/pg_type WHERE typname/g, 'pg_type WHERE typnamespace = current_schema()::regnamespace AND typname')
			);
		}
	}

	afterAll(async () => {
		await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
		await client.end();
	});

	it('runs cleanly on a fresh and on a populated database, dropping raw-token sessions', async () => {
		const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
		const tags: string[] = journal.entries.map((entry: { tag: string }) => entry.tag);
		const index = tags.indexOf('0035_hashed_login_sessions');
		expect(index).toBeGreaterThan(0);

		for (const populated of [false, true]) {
			await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
			await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
			await client.unsafe(`SET search_path TO ${SCHEMA}`);
			for (const tag of tags.slice(0, index)) await apply(tag);

			if (populated) {
				await client.unsafe(`
					INSERT INTO users (id, email, first_name, last_name, password_hash, role)
					VALUES ('20202020-2020-4020-8020-202020202001', 'm@example.com', 'M', 'G', 'x', 'admin')`);
				await client.unsafe(`
					INSERT INTO sessions (id, user_id, expires_at)
					VALUES ('raw-token', '20202020-2020-4020-8020-202020202001', now() + interval '1 day')`);
			}

			await apply(tags[index]);

			const [{ count }] = await client.unsafe(`SELECT count(*)::int AS count FROM sessions`);
			expect(count, populated ? 'populated' : 'fresh').toBe(0);
		}
	}, 60_000);
});

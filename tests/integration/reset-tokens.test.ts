// @vitest-environment node
//
// Issue 021 — password reset tokens are stored only as SHA-256 hashes; the
// emailed link still carries the raw token. Real test database.
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { eq, like } from 'drizzle-orm';
import { users } from '../../src/lib/server/db/schema';
import { getTestDatabase, closeTestDatabase, TEST_DATABASE_URL } from '../fixtures/database';

const testDb = getTestDatabase();

const sendStaffPasswordResetEmail = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../src/lib/server/services/email', () => ({ sendStaffPasswordResetEmail }));
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

const EMAIL_PREFIX = 'reset-tokens-test-';
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

let issueReset: (staffId: string) => Promise<Response>;
let resetPage: Awaited<typeof import('../../src/routes/(staff)/staff/reset-password/[token]/+page.server')>;

beforeAll(async () => {
	const { POST } = await import('../../src/routes/api/admin/team/staff/reset-password/+server');
	issueReset = (staffId) =>
		POST({
			request: new Request('http://admin.localhost/api', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ staffId }),
			}),
			locals: { user: { id: 'admin-id', email: 'admin@example.com', role: 'admin' } },
		} as any) as Promise<Response>;
	resetPage = await import('../../src/routes/(staff)/staff/reset-password/[token]/+page.server');
});

async function cleanUsers() {
	await testDb.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
}
beforeEach(async () => {
	vi.clearAllMocks();
	await cleanUsers();
});
afterAll(async () => {
	await cleanUsers();
	await closeTestDatabase();
});

async function seedStaff() {
	const [user] = await testDb
		.insert(users)
		.values({
			email: `${EMAIL_PREFIX}${Math.random().toString(36).slice(2, 8)}@example.com`,
			firstName: 'Test',
			lastName: 'Staff',
			passwordHash: 'unused',
			role: 'staff',
		})
		.returning();
	return user;
}

async function stored(userId: string) {
	const [row] = await testDb.select().from(users).where(eq(users.id, userId));
	return row;
}

function completeReset(token: string) {
	const form = new FormData();
	form.set('newPassword', 'fresh-password-123');
	form.set('confirmPassword', 'fresh-password-123');
	return resetPage.actions.default({
		request: new Request('http://staff.localhost/reset', { method: 'POST', body: form }),
		params: { token },
		locals: {},
	} as any);
}

describe('password reset tokens', () => {
	it('issuing a reset stores only the hash; the email carries the raw token', async () => {
		const staff = await seedStaff();

		expect((await issueReset(staff.id)).status).toBe(200);

		const rawToken = sendStaffPasswordResetEmail.mock.calls[0][0].resetToken as string;
		const row = await stored(staff.id);
		expect(row.passwordResetToken).toBe(sha256(rawToken));
		expect(row.passwordResetToken).not.toBe(rawToken);
	});

	it('the raw token from the link opens the reset page and completes the reset', async () => {
		const staff = await seedStaff();
		await issueReset(staff.id);
		const rawToken = sendStaffPasswordResetEmail.mock.calls[0][0].resetToken as string;

		const page = await resetPage.load({ params: { token: rawToken } } as any);
		expect(page).toMatchObject({ valid: true, email: staff.email });

		expect(await completeReset(rawToken)).toHaveProperty('success');
		const row = await stored(staff.id);
		expect(row.passwordResetToken).toBeNull();
		expect(row.passwordHash).not.toBe('unused');
	});

	it('a stored hash pasted as the token is rejected', async () => {
		const staff = await seedStaff();
		await issueReset(staff.id);
		const storedHash = (await stored(staff.id)).passwordResetToken!;

		expect(await resetPage.load({ params: { token: storedHash } } as any)).toEqual({ valid: false });
		expect(await completeReset(storedHash)).toHaveProperty('error');
		expect((await stored(staff.id)).passwordHash).toBe('unused');
	});
});

describe('0036_hashed_reset_tokens migration', () => {
	const SCHEMA = 'test_migration_hashed_reset_tokens';
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

	it('clears raw reset tokens and leaves the rest of the user untouched', async () => {
		const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
		const tags: string[] = journal.entries.map((entry: { tag: string }) => entry.tag);
		const index = tags.indexOf('0036_hashed_reset_tokens');
		expect(index).toBeGreaterThan(0);

		await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
		await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
		await client.unsafe(`SET search_path TO ${SCHEMA}`);
		for (const tag of tags.slice(0, index)) await apply(tag);
		await client.unsafe(`
			INSERT INTO users (email, first_name, last_name, password_hash, role, password_reset_token, password_reset_expires)
			VALUES ('r@example.com', 'R', 'T', 'kept-hash', 'staff', 'raw-token', now() + interval '1 day')`);

		await apply(tags[index]);

		const [row] = await client.unsafe(
			`SELECT password_hash, password_reset_token, password_reset_expires FROM users WHERE email = 'r@example.com'`
		);
		expect(row).toEqual({ password_hash: 'kept-hash', password_reset_token: null, password_reset_expires: null });
	}, 60_000);
});

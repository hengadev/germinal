// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0023_refund_policy (issue 027).
//
// Replays migrations 0000–0022 inside an isolated schema of the shared test
// database (same approach as deposit-migration.test.ts), inserts Events,
// applies 0023 and asserts that existing Events get a manual Refund Policy
// stating their current terms, while new Events default to a full refund
// until 24 hours before the Seating.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0023';
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

const client = postgres(TEST_DATABASE_URL, { max: 1 });

function splitStatements(sqlText: string): string[] {
	return sqlText
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

async function applyMigrationFile(fileName: string) {
	const statements = splitStatements(await readFile(path.join(MIGRATIONS_DIR, fileName), 'utf8'));
	for (const raw of statements) {
		const statement = raw
			.replace(/"public"\./g, `"${SCHEMA}".`)
			.replace(
				/pg_type WHERE typname/g,
				'pg_type WHERE typnamespace = current_schema()::regnamespace AND typname'
			);
		await client.unsafe(statement);
	}
}

const EVENT_A = '22222222-2222-4222-8222-222222222223';
const EVENT_B = '22222222-2222-4222-8222-222222222224';

async function insertEvent(id: string | null, slug: string) {
	const [row] = await client.unsafe(`
		INSERT INTO events (${id ? 'id, ' : ''}title_en, title_fr, slug, description_en, description_fr, start_date, end_date, location_en, location_fr)
		VALUES (${id ? `'${id}', ` : ''}'Event', 'Événement', '${slug}', 'Test', 'Test', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', 'Paris', 'Paris')
		RETURNING *
	`);
	return row;
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0023')
		.map((entry: { tag: string }) => `${entry.tag}.sql`);
	expect(preMigration.length).toBe(23);
	for (const file of preMigration) {
		await applyMigrationFile(file);
	}
});

afterAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`SET search_path TO public`);
	await client.end({ timeout: 5 });
});

describe('migration 0023 — Refund Policy', () => {
	it('gives existing Events a manual policy stating the terms they had', async () => {
		await insertEvent(EVENT_A, 'refund-migration-a');
		await insertEvent(EVENT_B, 'refund-migration-b');

		await applyMigrationFile('0023_refund_policy.sql');

		const rows = await client`
			SELECT id, refund_policy_type, refund_policy_text_en, refund_policy_text_fr, refund_policy_tiers
			FROM events ORDER BY id
		`;
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.refund_policy_type).toBe('manual');
			expect(row.refund_policy_tiers).toEqual([]);
			expect(row.refund_policy_text_en).toMatch(/up to 24 hours before your seating for a full refund/);
			expect(row.refund_policy_text_fr).toMatch(/jusqu’à 24 h avant votre séance pour un remboursement intégral/);
		}
	});

	it('defaults new Events to a full refund until 24 hours before', async () => {
		const created = await insertEvent(null, 'refund-new-event');
		expect(created.refund_policy_type).toBe('rules');
		expect(created.refund_policy_tiers).toEqual([{ hoursBefore: 24, percent: 100 }]);
		expect(created.refund_policy_text_en).toBeNull();
	});

	it('requires tiers to be an array, with 1 to 10 of them on a rule-based policy', async () => {
		const update = (set: string) => client.unsafe(`UPDATE events SET ${set} WHERE id = '${EVENT_A}'`);
		await expect(update(`refund_policy_type = 'rules', refund_policy_tiers = '[{"hoursBefore":48,"percent":100},{"hoursBefore":0,"percent":0}]'`)).resolves.toBeDefined();
		await expect(update(`refund_policy_type = 'rules', refund_policy_tiers = '[]'`)).rejects.toThrow();
		await expect(update(`refund_policy_type = 'manual', refund_policy_tiers = '[]'`)).resolves.toBeDefined();
		await expect(update(`refund_policy_type = 'manual', refund_policy_tiers = '{}'`)).rejects.toThrow();
		await expect(update(`refund_policy_type = 'rules', refund_policy_tiers = '${JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ hoursBefore: i, percent: 0 })))}'`)).rejects.toThrow();
	});
});

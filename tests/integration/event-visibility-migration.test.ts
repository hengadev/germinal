// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0025_event_visibility (issue 032).
//
// Replays migrations 0000–0024 inside an isolated schema of the shared test
// database (same approach as refund-policy-migration.test.ts), inserts
// published and unpublished Events, applies 0025 and asserts that published
// Events become Public, the others Draft, that the flag is gone and that a
// Spotlight left on a Draft is cleared.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0025';
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

const PUBLISHED = '25252525-2525-4252-8252-252525252501';
const UNPUBLISHED = '25252525-2525-4252-8252-252525252502';
const UNPUBLISHED_SPOTLIGHT = '25252525-2525-4252-8252-252525252503';
const PUBLISHED_SPOTLIGHT = '25252525-2525-4252-8252-252525252504';

async function insertEvent(id: string, published: boolean, isSpotlight = false) {
	await client.unsafe(`
		INSERT INTO events (id, title_en, title_fr, description_en, description_fr, start_date, end_date, location_en, location_fr, published, is_spotlight)
		VALUES ('${id}', 'Event', 'Événement', 'Test', 'Test', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', 'Paris', 'Paris', ${published}, ${isSpotlight})
	`);
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0025')
		.map((entry: { tag: string }) => `${entry.tag}.sql`);
	expect(preMigration.length).toBe(25);
	for (const file of preMigration) {
		await applyMigrationFile(file);
	}
});

afterAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`SET search_path TO public`);
	await client.end({ timeout: 5 });
});

describe('migration 0025 — Event Visibility', () => {
	it('makes published Events Public and the others Draft, and drops the flag', async () => {
		await insertEvent(PUBLISHED, true);
		await insertEvent(UNPUBLISHED, false);
		await insertEvent(UNPUBLISHED_SPOTLIGHT, false, true);
		await insertEvent(PUBLISHED_SPOTLIGHT, true, true);

		await applyMigrationFile('0025_event_visibility.sql');

		const rows = await client`SELECT id, visibility, is_spotlight FROM events ORDER BY id`;
		expect(rows.map((row) => [row.id, row.visibility, row.is_spotlight])).toEqual([
			[PUBLISHED, 'public', false],
			[UNPUBLISHED, 'draft', false],
			// Only a Public Event may be the Spotlight.
			[UNPUBLISHED_SPOTLIGHT, 'draft', false],
			[PUBLISHED_SPOTLIGHT, 'public', true],
		]);

		const columns = await client`
			SELECT column_name FROM information_schema.columns
			WHERE table_schema = ${SCHEMA} AND table_name = 'events' AND column_name = 'published'
		`;
		expect(columns).toHaveLength(0);
	});

	it('creates new Events as Drafts', async () => {
		const [row] = await client.unsafe(`
			INSERT INTO events (title_en, title_fr, description_en, description_fr, start_date, end_date, location_en, location_fr)
			VALUES ('New', 'Nouveau', 'Test', 'Test', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', 'Paris', 'Paris')
			RETURNING visibility
		`);
		expect(row.visibility).toBe('draft');
	});

	it('only accepts draft, private or public', async () => {
		await expect(client.unsafe(`UPDATE events SET visibility = 'private' WHERE id = '${PUBLISHED}'`)).resolves.toBeDefined();
		await expect(client.unsafe(`UPDATE events SET visibility = 'hidden' WHERE id = '${PUBLISHED}'`)).rejects.toThrow();
	});
});

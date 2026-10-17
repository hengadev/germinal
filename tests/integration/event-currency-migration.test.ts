// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0029_event_currency (issue 042).
//
// Replays migrations 0000–0028 inside an isolated schema of the shared test
// database (same approach as event-visibility-migration.test.ts), inserts
// Events whose Services are priced in EUR, in USD or in a mix, and one
// without Services, applies 0029 and asserts that each Event takes the
// currency its Services use (the most common one), that an Event without
// Services gets EUR, and that the per-Service column is gone.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0029';
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

const IN_EUROS = '29292929-2929-4292-8292-292929292901';
const IN_DOLLARS = '29292929-2929-4292-8292-292929292902';
const MIXED = '29292929-2929-4292-8292-292929292903';
const NO_SERVICES = '29292929-2929-4292-8292-292929292904';

async function insertEvent(id: string) {
	await client.unsafe(`INSERT INTO events (id, title_en, title_fr) VALUES ('${id}', 'Event', 'Événement')`);
}

/** One Day per currency entry, each with a dinner Service in it. */
async function insertServices(eventId: string, currencies: string[]) {
	for (const [index, currency] of currencies.entries()) {
		const [day] = await client.unsafe(
			`INSERT INTO event_days (event_id, date) VALUES ('${eventId}', '2026-07-${String(10 + index).padStart(2, '0')}') RETURNING id`
		);
		await client.unsafe(`
			INSERT INTO event_services (day_id, kind, default_seating_duration_minutes, price_amount, currency)
			VALUES ('${day.id}', 'dinner', 120, 4500, '${currency}')
		`);
	}
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0029')
		.map((entry: { tag: string }) => `${entry.tag}.sql`);
	expect(preMigration.length).toBe(29);
	for (const file of preMigration) {
		await applyMigrationFile(file);
	}
});

afterAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`SET search_path TO public`);
	await client.end({ timeout: 5 });
});

describe('migration 0029 — one currency per Event', () => {
	it('gives each Event its Services’ currency and drops the per-Service column', async () => {
		await insertEvent(IN_EUROS);
		await insertServices(IN_EUROS, ['EUR', 'EUR']);
		await insertEvent(IN_DOLLARS);
		await insertServices(IN_DOLLARS, ['USD']);
		await insertEvent(MIXED);
		await insertServices(MIXED, ['GBP', 'EUR', 'GBP']);
		await insertEvent(NO_SERVICES);

		await applyMigrationFile('0029_event_currency.sql');

		const rows = await client`SELECT id, currency FROM events ORDER BY id`;
		expect(rows.map((row) => ({ ...row }))).toEqual([
			{ id: IN_EUROS, currency: 'EUR' },
			{ id: IN_DOLLARS, currency: 'USD' },
			{ id: MIXED, currency: 'GBP' },
			{ id: NO_SERVICES, currency: 'EUR' },
		]);

		const columns = await client`
			SELECT column_name FROM information_schema.columns
			WHERE table_schema = ${SCHEMA} AND table_name = 'event_services' AND column_name = 'currency'
		`;
		expect(columns).toHaveLength(0);
	});

	it('defaults new Events to EUR', async () => {
		const [created] = await client.unsafe(`INSERT INTO events (title_en) VALUES ('New') RETURNING currency`);
		expect(created.currency).toBe('EUR');
	});
});

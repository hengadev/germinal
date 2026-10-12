// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0022_deposit_and_balance (issue 023).
//
// Replays migrations 0000–0021 inside an isolated schema of the shared test
// database (same approach as service-price-migration.test.ts), inserts an
// Event with paid, comp and pending Reservations, applies 0022 and asserts
// that existing Events take full payment online (a 100 % Deposit) and that
// every existing Reservation is recorded as paid in full: Deposit = total,
// Balance = 0.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0022';
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

const EVENT = '22222222-2222-4222-8222-222222222222';
const SEATING = '33333333-3333-4333-8333-333333333333';

async function insertReservation(id: string, total: number, extra: { status?: string; isComp?: boolean; discount?: number } = {}) {
	await client.unsafe(`
		INSERT INTO reservations (id, event_session_id, guest_email, guest_name, quantity, total_amount, discount_amount, status, is_comp, access_token, expires_at)
		VALUES ('${id}', '${SEATING}', 'guest@example.com', 'Guest', 2, ${total}, ${extra.discount ?? 0},
			'${extra.status ?? 'confirmed'}', ${extra.isComp ?? false}, 'atk-${id}', now())
	`);
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0022')
		.map((entry: { tag: string }) => `${entry.tag}.sql`);
	expect(preMigration.length).toBe(22);
	for (const file of preMigration) {
		await applyMigrationFile(file);
	}
});

afterAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`SET search_path TO public`);
	await client.end({ timeout: 5 });
});

describe('migration 0022 — Deposit rule and the Reservation Deposit and Balance', () => {
	it('gives existing Events full payment online and records existing Reservations as paid in full', async () => {
		await client.unsafe(`
			INSERT INTO events (id, title_en, title_fr, slug, description_en, description_fr, start_date, end_date, location_en, location_fr)
			VALUES ('${EVENT}', 'Event', 'Événement', 'deposit-migration', 'Test', 'Test', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', 'Paris', 'Paris')
		`);
		const [day] = await client.unsafe(`INSERT INTO event_days (event_id, date) VALUES ('${EVENT}', '2026-07-10') RETURNING id`);
		const [service] = await client.unsafe(`
			INSERT INTO event_services (day_id, kind, default_seating_duration_minutes, price_amount)
			VALUES ('${day.id}', 'dinner', 120, 4500) RETURNING id
		`);
		await client.unsafe(`
			INSERT INTO event_sessions (id, event_id, service_id, start_time, end_time, total_capacity, available_capacity)
			VALUES ('${SEATING}', '${EVENT}', '${service.id}', '2026-07-10T19:00:00Z', '2026-07-10T21:00:00Z', 20, 14)
		`);

		await insertReservation('aaaaaaa0-0000-4000-8000-000000000001', 9000);
		await insertReservation('aaaaaaa0-0000-4000-8000-000000000002', 8100, { discount: 900 });
		await insertReservation('aaaaaaa0-0000-4000-8000-000000000003', 0, { isComp: true });
		await insertReservation('aaaaaaa0-0000-4000-8000-000000000004', 9000, { status: 'pending' });

		await applyMigrationFile('0022_deposit_and_balance.sql');

		const [event] = await client`SELECT deposit_type, deposit_value FROM events WHERE id = ${EVENT}`;
		expect(event).toEqual({ deposit_type: 'percent', deposit_value: 100 });

		const rows = await client`
			SELECT id, total_amount, discount_amount, deposit_amount, balance_amount
			FROM reservations ORDER BY id
		`;
		expect(rows.map((row) => ({ ...row }))).toEqual([
			{ id: 'aaaaaaa0-0000-4000-8000-000000000001', total_amount: 9000, discount_amount: 0, deposit_amount: 9000, balance_amount: 0 },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000002', total_amount: 8100, discount_amount: 900, deposit_amount: 8100, balance_amount: 0 },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000003', total_amount: 0, discount_amount: 0, deposit_amount: 0, balance_amount: 0 },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000004', total_amount: 9000, discount_amount: 0, deposit_amount: 9000, balance_amount: 0 },
		]);
	});

	it('defaults new Events to full payment online and enforces valid Deposit rules', async () => {
		const [created] = await client.unsafe(`
			INSERT INTO events (title_en, title_fr, slug, description_en, description_fr, start_date, end_date, location_en, location_fr)
			VALUES ('New', 'Nouveau', 'deposit-new-event', 'Test', 'Test', '2026-08-01T00:00:00Z', '2026-08-01T23:59:59Z', 'Paris', 'Paris')
			RETURNING id, deposit_type, deposit_value
		`);
		expect(created).toMatchObject({ deposit_type: 'percent', deposit_value: 100 });

		await expect(client.unsafe(`UPDATE events SET deposit_type = 'none', deposit_value = 0 WHERE id = '${created.id}'`)).resolves.toBeDefined();
		await expect(client.unsafe(`UPDATE events SET deposit_type = 'fixed', deposit_value = 2000 WHERE id = '${created.id}'`)).resolves.toBeDefined();
		await expect(client.unsafe(`UPDATE events SET deposit_type = 'percent', deposit_value = 0 WHERE id = '${created.id}'`)).rejects.toThrow();
		await expect(client.unsafe(`UPDATE events SET deposit_type = 'none', deposit_value = 10 WHERE id = '${created.id}'`)).rejects.toThrow();
	});

	it('requires Deposit + Balance = total on new Reservations', async () => {
		await expect(client.unsafe(`
			INSERT INTO reservations (event_session_id, guest_email, guest_name, quantity, total_amount, deposit_amount, balance_amount, access_token, expires_at)
			VALUES ('${SEATING}', 'g@example.com', 'G', 1, 4500, 1000, 3000, 'atk-bad', now())
		`)).rejects.toThrow();
		await expect(client.unsafe(`
			INSERT INTO reservations (event_session_id, guest_email, guest_name, quantity, total_amount, access_token, expires_at)
			VALUES ('${SEATING}', 'g@example.com', 'G', 1, 4500, 'atk-missing', now())
		`)).rejects.toThrow();
		await expect(client.unsafe(`
			INSERT INTO reservations (event_session_id, guest_email, guest_name, quantity, total_amount, deposit_amount, balance_amount, access_token, expires_at)
			VALUES ('${SEATING}', 'g@example.com', 'G', 1, 4500, 1350, 3150, 'atk-good', now())
		`)).resolves.toBeDefined();
	});
});

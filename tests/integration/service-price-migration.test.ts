// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0021_service_menus_and_price (issue 022).
//
// Replays migrations 0000–0020 inside an isolated schema of the shared test
// database (same approach as venue-capacity-migration.test.ts), inserts
// Services whose Seatings carry various prices — including Services that
// 0018 merged from Sessions with different prices — applies 0021 and
// asserts that each Service takes the price most of its Seatings share,
// that a Seating priced differently keeps its price as a legacy price, and
// that no Seating's booking price changes.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0021';
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

const EVENT = '11111111-1111-4111-8111-111111111111';

/** One Day + Service of the Event; returns the Service id. */
async function insertService(date: string, kind: 'lunch' | 'dinner'): Promise<string> {
	const [day] = await client.unsafe(`
		INSERT INTO event_days (event_id, date) VALUES ('${EVENT}', '${date}')
		ON CONFLICT (event_id, date) DO UPDATE SET updated_at = now()
		RETURNING id
	`);
	const [service] = await client.unsafe(`
		INSERT INTO event_services (day_id, kind, default_seating_duration_minutes)
		VALUES ('${day.id}', '${kind}', 120) RETURNING id
	`);
	return service.id;
}

async function insertSeating(id: string, serviceId: string, start: string, price: number, currency = 'EUR') {
	await client.unsafe(`
		INSERT INTO event_sessions (id, event_id, service_id, start_time, end_time, total_capacity, available_capacity, price_amount, currency)
		VALUES ('${id}', '${EVENT}', '${serviceId}', '${start}', '${start}'::timestamptz + interval '2 hours', 20, 20, ${price}, '${currency}')
	`);
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0021')
		.map((entry: { tag: string }) => `${entry.tag}.sql`);
	expect(preMigration.length).toBe(21);
	for (const file of preMigration) {
		await applyMigrationFile(file);
	}
});

afterAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`SET search_path TO public`);
	await client.end({ timeout: 5 });
});

describe('migration 0021 — Menus and the Service price', () => {
	it('moves each Seating price to its Service without changing any booking price', async () => {
		await client.unsafe(`
			INSERT INTO events (id, title_en, title_fr, slug, description_en, description_fr, start_date, end_date, location_en, location_fr)
			VALUES ('${EVENT}', 'Event', 'Événement', 'price-migration', 'Test', 'Test', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', 'Paris', 'Paris')
		`);

		// Merged by 0018 from three Sessions: two at €45, one at €60.
		const majority = await insertService('2026-07-10', 'dinner');
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000001', majority, '2026-07-10T19:00:00Z', 4500);
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000002', majority, '2026-07-10T21:30:00Z', 6000);
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000003', majority, '2026-07-10T23:00:00Z', 4500);

		// A tie (one Seating each): the earliest Seating's price wins.
		const tie = await insertService('2026-07-11', 'dinner');
		await insertSeating('bbbbbbb0-0000-4000-8000-000000000004', tie, '2026-07-11T21:00:00Z', 3000);
		await insertSeating('bbbbbbb0-0000-4000-8000-000000000005', tie, '2026-07-11T18:00:00Z', 5000);

		// A free Service.
		const free = await insertService('2026-07-12', 'lunch');
		await insertSeating('ccccccc0-0000-4000-8000-000000000006', free, '2026-07-12T12:00:00Z', 0);

		// Same amount, different currency (one stored in lowercase).
		const currencies = await insertService('2026-07-12', 'dinner');
		await insertSeating('ddddddd0-0000-4000-8000-000000000007', currencies, '2026-07-12T19:00:00Z', 4000, 'eur');
		await insertSeating('ddddddd0-0000-4000-8000-000000000008', currencies, '2026-07-12T21:00:00Z', 4000, 'USD');

		// A Service picked on the Days picker with no Seating yet.
		const empty = await insertService('2026-07-13', 'lunch');

		const before = await client`SELECT id, price_amount, upper(currency) AS currency FROM event_sessions ORDER BY id`;

		await applyMigrationFile('0021_service_menus_and_price.sql');

		const services = await client`SELECT id, menu_id, price_amount, currency FROM event_services`;
		const byId = new Map(services.map((row) => [row.id, row]));
		expect(byId.get(majority)).toMatchObject({ menu_id: null, price_amount: 4500, currency: 'EUR' });
		expect(byId.get(tie)).toMatchObject({ price_amount: 5000, currency: 'EUR' });
		expect(byId.get(free)).toMatchObject({ price_amount: 0, currency: 'EUR' });
		expect(byId.get(currencies)).toMatchObject({ price_amount: 4000, currency: 'EUR' });
		expect(byId.get(empty)).toMatchObject({ price_amount: null, currency: 'EUR' });

		const seatings = await client`
			SELECT id, legacy_price_amount, legacy_currency FROM event_sessions ORDER BY id
		`;
		expect(seatings).toEqual([
			{ id: 'aaaaaaa0-0000-4000-8000-000000000001', legacy_price_amount: null, legacy_currency: null },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000002', legacy_price_amount: 6000, legacy_currency: 'EUR' },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000003', legacy_price_amount: null, legacy_currency: null },
			{ id: 'bbbbbbb0-0000-4000-8000-000000000004', legacy_price_amount: 3000, legacy_currency: 'EUR' },
			{ id: 'bbbbbbb0-0000-4000-8000-000000000005', legacy_price_amount: null, legacy_currency: null },
			{ id: 'ccccccc0-0000-4000-8000-000000000006', legacy_price_amount: null, legacy_currency: null },
			{ id: 'ddddddd0-0000-4000-8000-000000000007', legacy_price_amount: null, legacy_currency: null },
			{ id: 'ddddddd0-0000-4000-8000-000000000008', legacy_price_amount: 4000, legacy_currency: 'USD' },
		]);

		// The price a Seating is booked at (legacy price, else its Service's)
		// is exactly its pre-migration price, for every Seating.
		const after = await client`
			SELECT es.id,
				coalesce(es.legacy_price_amount, s.price_amount) AS price_amount,
				coalesce(es.legacy_currency, s.currency) AS currency
			FROM event_sessions es JOIN event_services s ON s.id = es.service_id
			ORDER BY es.id
		`;
		expect(after).toEqual(before);
	});

	it('enforces the price constraints and keeps an attached Menu from being deleted on its own', async () => {
		const [service] = await client`SELECT id FROM event_services WHERE price_amount = 4500`;

		await expect(client.unsafe(`UPDATE event_services SET price_amount = -1 WHERE id = '${service.id}'`))
			.rejects.toThrow(/event_services_price_check/);
		await expect(client.unsafe(`
			UPDATE event_sessions SET legacy_price_amount = 100, legacy_currency = NULL
			WHERE id = 'aaaaaaa0-0000-4000-8000-000000000001'
		`)).rejects.toThrow(/event_sessions_legacy_price_check/);

		const [menu] = await client.unsafe(`
			INSERT INTO event_menus (event_id, name_en, name_fr) VALUES ('${EVENT}', 'Tasting menu', 'Menu dégustation')
			RETURNING id
		`);
		await client.unsafe(`UPDATE event_services SET menu_id = '${menu.id}' WHERE id = '${service.id}'`);

		await expect(client.unsafe(`DELETE FROM event_menus WHERE id = '${menu.id}'`))
			.rejects.toThrow(/event_services_menu_id_event_menus_id_fk/);

		// Deleting the Event cascades to its Menus and Services in one go.
		await client.unsafe(`DELETE FROM events WHERE id = '${EVENT}'`);
		expect(await client`SELECT id FROM event_menus`).toHaveLength(0);
		expect(await client`SELECT id FROM event_services`).toHaveLength(0);
	});
});

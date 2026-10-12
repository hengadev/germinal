// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0020_venue_capacity (issue 021).
//
// Replays migrations 0000–0019 inside an isolated schema of the shared test
// database (same approach as days-services-migration.test.ts), inserts
// Events with Seatings of various capacities, applies 0020 and asserts the
// backfill: each Event's Venue Capacity is its largest Seating capacity, the
// Seatings that differ are marked as overrides, and no capacity changes.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0020';
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

async function insertEvent(id: string, slug: string) {
	await client.unsafe(`
		INSERT INTO events (id, title_en, title_fr, slug, description_en, description_fr, start_date, end_date, location_en, location_fr)
		VALUES ('${id}', 'Event ${slug}', 'Événement ${slug}', '${slug}', 'Test', 'Test', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z', 'Paris', 'Paris')
	`);
}

/** One Day + dinner Service for the Event; returns the Service id. */
async function insertService(eventId: string, date: string): Promise<string> {
	const [day] = await client.unsafe(`
		INSERT INTO event_days (event_id, date) VALUES ('${eventId}', '${date}') RETURNING id
	`);
	const [service] = await client.unsafe(`
		INSERT INTO event_services (day_id, kind, default_seating_duration_minutes)
		VALUES ('${day.id}', 'dinner', 180) RETURNING id
	`);
	return service.id;
}

async function insertSeating(id: string, eventId: string, serviceId: string, start: string, total: number, available: number) {
	await client.unsafe(`
		INSERT INTO event_sessions (id, event_id, service_id, start_time, end_time, total_capacity, available_capacity, price_amount)
		VALUES ('${id}', '${eventId}', '${serviceId}', '${start}', '${start}'::timestamptz + interval '3 hours', ${total}, ${available}, 4500)
	`);
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0020')
		.map((entry: { tag: string }) => `${entry.tag}.sql`);
	expect(preMigration.length).toBeGreaterThan(0);
	for (const file of preMigration) {
		await applyMigrationFile(file);
	}
});

afterAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`SET search_path TO public`);
	await client.end({ timeout: 5 });
});

describe('migration 0020 — Venue Capacity backfill', () => {
	it('takes the largest Seating capacity as Venue Capacity and marks the others as overrides', async () => {
		const eventA = '11111111-1111-4111-8111-111111111111';
		const eventB = '22222222-2222-4222-8222-222222222222';
		const eventC = '33333333-3333-4333-8333-333333333333';
		await insertEvent(eventA, 'venue-a');
		await insertEvent(eventB, 'venue-b');
		await insertEvent(eventC, 'venue-c'); // no Seating

		const serviceA = await insertService(eventA, '2026-07-10');
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000001', eventA, serviceA, '2026-07-10T19:00:00Z', 40, 31);
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000002', eventA, serviceA, '2026-07-10T22:00:00Z', 12, 2);
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000003', eventA, serviceA, '2026-07-10T16:00:00Z', 40, 40);
		const serviceB = await insertService(eventB, '2026-07-11');
		await insertSeating('bbbbbbb0-0000-4000-8000-000000000004', eventB, serviceB, '2026-07-11T19:00:00Z', 0, 0);

		await applyMigrationFile('0020_venue_capacity.sql');

		const venues = await client`SELECT id, venue_capacity FROM events ORDER BY id`;
		expect(venues).toEqual([
			{ id: eventA, venue_capacity: 40 },
			{ id: eventB, venue_capacity: null }, // only a 0-capacity Seating
			{ id: eventC, venue_capacity: null },
		]);

		const seatings = await client`
			SELECT id, total_capacity, available_capacity, capacity_overridden
			FROM event_sessions ORDER BY id
		`;
		expect(seatings).toEqual([
			{ id: 'aaaaaaa0-0000-4000-8000-000000000001', total_capacity: 40, available_capacity: 31, capacity_overridden: false },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000002', total_capacity: 12, available_capacity: 2, capacity_overridden: true },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000003', total_capacity: 40, available_capacity: 40, capacity_overridden: false },
			{ id: 'bbbbbbb0-0000-4000-8000-000000000004', total_capacity: 0, available_capacity: 0, capacity_overridden: true },
		]);

		await expect(client.unsafe(`UPDATE events SET venue_capacity = 0 WHERE id = '${eventC}'`)).rejects.toThrow(
			/events_venue_capacity_check/
		);
	});
});

// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0026_event_time_zone (issue 034, ADR 0006).
//
// Replays migrations 0000–0024 inside an isolated schema of the shared test
// database (same approach as venue-capacity-migration.test.ts), inserts
// Seatings typed as UTC clock readings, applies 0026 and asserts that every
// Event is in Europe/Paris and each Seating's stored UTC clock reading is now
// the same Europe/Paris wall-clock time.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0026';
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

import { clockOf, dayOf } from '../../src/lib/utils/event-time';

async function insertEvent(id: string) {
	await client.unsafe(`
		INSERT INTO events (id, title_en, title_fr, description_en, description_fr, start_date, end_date, location_en, location_fr)
		VALUES ('${id}', 'Event', 'Événement', 'Test', 'Test', '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z', 'Paris', 'Paris')
	`);
}

async function insertService(eventId: string, date: string, kind: 'lunch' | 'dinner'): Promise<string> {
	const [day] = await client.unsafe(`
		INSERT INTO event_days (event_id, date) VALUES ('${eventId}', '${date}')
		ON CONFLICT (event_id, date) DO UPDATE SET updated_at = now() RETURNING id
	`);
	const [service] = await client.unsafe(`
		INSERT INTO event_services (day_id, kind, default_seating_duration_minutes)
		VALUES ('${day.id}', '${kind}', 120) RETURNING id
	`);
	return service.id;
}

async function insertSeating(id: string, eventId: string, serviceId: string, start: string, end: string) {
	await client.unsafe(`
		INSERT INTO event_sessions (id, event_id, service_id, start_time, end_time, total_capacity, available_capacity)
		VALUES ('${id}', '${eventId}', '${serviceId}', '${start}', '${end}', 20, 20)
	`);
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0026')
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

describe('migration 0026 — Event Time Zone', () => {
	it('puts every Event in Europe/Paris and keeps the typed clock readings as Paris times', async () => {
		const eventA = '11111111-1111-4111-8111-111111111111';
		const eventB = '22222222-2222-4222-8222-222222222222'; // no Days
		await insertEvent(eventA);
		await insertEvent(eventB);

		const summerDinner = await insertService(eventA, '2026-07-10', 'dinner');
		const winterLunch = await insertService(eventA, '2026-01-15', 'lunch');
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000001', eventA, summerDinner, '2026-07-10T20:00:00Z', '2026-07-10T23:00:00Z');
		await insertSeating('aaaaaaa0-0000-4000-8000-000000000002', eventA, winterLunch, '2026-01-15T12:30:00Z', '2026-01-15T14:00:00Z');

		await applyMigrationFile('0026_event_time_zone.sql');

		const zones = await client`SELECT id, time_zone FROM events ORDER BY id`;
		expect(zones).toEqual([
			{ id: eventA, time_zone: 'Europe/Paris' },
			{ id: eventB, time_zone: 'Europe/Paris' },
		]);

		const seatings = await client`SELECT id, start_time, end_time FROM event_sessions ORDER BY id`;
		const read = seatings.map((row) => ({
			day: dayOf(row.start_time, 'Europe/Paris'),
			start: clockOf(row.start_time, 'Europe/Paris'),
			end: clockOf(row.end_time, 'Europe/Paris'),
			startUtc: (row.start_time as Date).toISOString(),
		}));
		expect(read).toEqual([
			// Stored as 20:00Z, now reads 20:00 in Paris (18:00Z in summer).
			{ day: '2026-07-10', start: '20:00', end: '23:00', startUtc: '2026-07-10T18:00:00.000Z' },
			{ day: '2026-01-15', start: '12:30', end: '14:00', startUtc: '2026-01-15T11:30:00.000Z' },
		]);

		// Start/end dates are the first and last Day, in Paris; an Event with
		// no Days keeps its dates.
		const dates = await client`SELECT id, start_date, end_date FROM events ORDER BY id`;
		expect(dates.map((row) => [(row.start_date as Date).toISOString(), (row.end_date as Date).toISOString()])).toEqual([
			['2026-01-14T23:00:00.000Z', '2026-07-10T21:59:59.999Z'],
			['2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.000Z'],
		]);

		// New Events default to Europe/Paris.
		const [fresh] = await client.unsafe(`
			INSERT INTO events (title_en, title_fr, description_en, description_fr, start_date, end_date, location_en, location_fr)
			VALUES ('New', 'Nouveau', 'T', 'T', now(), now(), 'L', 'L') RETURNING time_zone
		`);
		expect(fresh.time_zone).toBe('Europe/Paris');
	});
});

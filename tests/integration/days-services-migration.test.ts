// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for 0018_days_services_seatings (issue 018).
//
// The test replays migrations 0000–0017 inside an isolated schema of the
// shared test database, inserts legacy Sessions the way the pre-migration
// schema allowed (no service_id), then applies 0018 and asserts that each
// Session was wrapped in the expected Day → Service → Seating structure and
// that Event start/end dates were recomputed from the Days.
//
// A dedicated single-connection client keeps `SET search_path` scoped to
// this test regardless of pooling.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_0018';
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

const client = postgres(TEST_DATABASE_URL, { max: 1 });

/** Split a Drizzle migration file into individual statements. */
function splitStatements(sqlText: string): string[] {
	return sqlText
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

async function applyMigrationFile(fileName: string) {
	const statements = splitStatements(await readFile(path.join(MIGRATIONS_DIR, fileName), 'utf8'));
	for (const raw of statements) {
		// Drizzle qualifies types and FK targets with the "public" schema;
		// replay them into the isolated schema instead. Type-existence guards
		// in DO blocks check pg_type globally, so scope them to the current
		// schema — otherwise a type that already exists in "public" would make
		// the guard skip creating it in the isolated schema.
		const statement = raw
			.replace(/"public"\./g, `"${SCHEMA}".`)
			.replace(
				/pg_type WHERE typname/g,
				'pg_type WHERE typnamespace = current_schema()::regnamespace AND typname'
			);
		await client.unsafe(statement);
	}
}

interface LegacySession {
	id: string;
	startTime: string;
	endTime: string;
}

async function insertLegacyEvent(id: string, slug: string, start: string, end: string) {
	await client.unsafe(`
		INSERT INTO events (id, title_en, title_fr, slug, description_en, description_fr, start_date, end_date, location_en, location_fr, published)
		VALUES ('${id}', 'Test Event ${slug}', 'Événement Test ${slug}', '${slug}', 'Test', 'Test', '${start}', '${end}', 'Paris', 'Paris', true)
	`);
}

async function insertLegacySession(eventId: string, session: LegacySession) {
	await client.unsafe(`
		INSERT INTO event_sessions (id, event_id, title_en, title_fr, start_time, end_time, total_capacity, available_capacity, price_amount, currency, published)
		VALUES ('${session.id}', '${eventId}', 'Seating', 'Séance', '${session.startTime}', '${session.endTime}', 40, 40, 2500, 'EUR', true)
	`);
}

beforeAll(async () => {
	// Fresh isolated schema with the pre-0018 structure, following the
	// migration journal's order (orphan .sql files are ignored, as by the
	// migrate script).
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const preMigration = journal.entries
		.filter((entry: { tag: string }) => entry.tag < '0018')
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

describe('migration 0018 — days, services and migrated seatings', () => {
	it('wraps each legacy Session in one Day + one Service + one Seating', async () => {
		const eventA = '11111111-1111-4111-8111-111111111111';
		const eventB = '22222222-2222-4222-8222-222222222222';

		await insertLegacyEvent(eventA, 'migration-test-a', '2026-07-01T10:00:00Z', '2026-07-31T23:00:00Z');
		await insertLegacyEvent(eventB, 'migration-test-b', '2026-08-01T10:00:00Z', '2026-08-31T23:00:00Z');

		await insertLegacySession(eventA, {
			id: 'aaaaaaa0-0000-4000-8000-000000000001',
			startTime: '2026-07-10T12:00:00Z', // lunch
			endTime: '2026-07-10T13:15:00Z',
		});
		await insertLegacySession(eventA, {
			id: 'aaaaaaa0-0000-4000-8000-000000000002',
			startTime: '2026-07-10T12:45:00Z', // same Day + lunch → same Service
			endTime: '2026-07-10T13:30:00Z',
		});
		await insertLegacySession(eventA, {
			id: 'aaaaaaa0-0000-4000-8000-000000000003',
			startTime: '2026-07-12T19:30:00Z', // dinner
			endTime: '2026-07-12T22:30:00Z',
		});
		await insertLegacySession(eventA, {
			id: 'aaaaaaa0-0000-4000-8000-000000000004',
			startTime: '2026-07-12T16:00:00Z', // exactly the cut-off → dinner (same Service as above)
			endTime: '2026-07-12T17:00:00Z',
		});
		await insertLegacySession(eventB, {
			id: 'bbbbbbb0-0000-4000-8000-000000000005',
			startTime: '2026-08-20T12:30:00Z', // lunch
			endTime: '2026-08-20T14:30:00Z',
		});

		// An Event with no Sessions: the migration must leave its dates alone.
		const eventC = '33333333-3333-4333-8333-333333333333';
		await insertLegacyEvent(eventC, 'migration-test-c', '2026-09-01T10:00:00Z', '2026-09-30T23:00:00Z');

		await applyMigrationFile('0018_days_services_seatings.sql');

		// --- Days: one per distinct Event + UTC date ---
		const days = await client`
			SELECT event_id, to_char(date, 'YYYY-MM-DD') AS date
			FROM event_days
			ORDER BY event_id, date
		`;
		expect(days).toEqual([
			{ event_id: eventA, date: '2026-07-10' },
			{ event_id: eventA, date: '2026-07-12' },
			{ event_id: eventB, date: '2026-08-20' },
		]);

		// --- Services: one per Day + kind, duration from the longest Session ---
		const services = await client`
			SELECT to_char(d.date, 'YYYY-MM-DD') AS date, sv.kind, sv.default_seating_duration_minutes AS duration
			FROM event_services sv
			JOIN event_days d ON d.id = sv.day_id
			WHERE d.event_id = ${eventA}
			ORDER BY d.date, sv.kind
		`;
		expect(services).toEqual([
			{ date: '2026-07-10', kind: 'lunch', duration: 75 }, // max(75, 45)
			{ date: '2026-07-12', kind: 'dinner', duration: 180 }, // max(180, 60)
		]);

		// --- Every Seating belongs to exactly one Service, grouped as expected ---
		const seatings = await client`
			SELECT es.id, to_char(d.date, 'YYYY-MM-DD') AS date, sv.kind
			FROM event_sessions es
			JOIN event_services sv ON sv.id = es.service_id
			JOIN event_days d ON d.id = sv.day_id
			ORDER BY es.id
		`;
		expect(seatings).toEqual([
			{ id: 'aaaaaaa0-0000-4000-8000-000000000001', date: '2026-07-10', kind: 'lunch' },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000002', date: '2026-07-10', kind: 'lunch' },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000003', date: '2026-07-12', kind: 'dinner' },
			{ id: 'aaaaaaa0-0000-4000-8000-000000000004', date: '2026-07-12', kind: 'dinner' },
			{ id: 'bbbbbbb0-0000-4000-8000-000000000005', date: '2026-08-20', kind: 'lunch' },
		]);

		// The two lunch Seatings share one Service; the 19:30 and 16:00 dinner
		// Seatings share the other.
		const serviceIds = await client`
			SELECT es.service_id, count(*)::int AS seatings
			FROM event_sessions es
			JOIN event_services sv ON sv.id = es.service_id
			JOIN event_days d ON d.id = sv.day_id
			WHERE es.event_id = ${eventA}
			GROUP BY es.service_id
			ORDER BY seatings
		`;
		expect(serviceIds).toEqual([
			{ service_id: expect.any(String), seatings: 2 },
			{ service_id: expect.any(String), seatings: 2 },
		]);

		// --- An Event with no Sessions keeps its hand-set dates ---
		const [untouched] = await client`
			SELECT to_char(start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS start_date
			FROM events WHERE id = ${eventC}
		`;
		expect(untouched.start_date).toBe('2026-09-01T10:00:00');

		// --- Event start/end dates recomputed from first and last Day ---
		const migrated = await client`
			SELECT
				to_char(start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS start_date,
				to_char(end_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS end_date
			FROM events
			WHERE id IN (${eventA}, ${eventB})
			ORDER BY id
		`;
		expect(migrated).toEqual([
			{
				start_date: '2026-07-10T00:00:00.000000',
				end_date: '2026-07-12T23:59:59.999999',
			},
			{
				start_date: '2026-08-20T00:00:00.000000',
				end_date: '2026-08-20T23:59:59.999999',
			},
		]);

		// --- The constraint is enforced: service_id is NOT NULL with its FK ---
		const column = await client`
			SELECT is_nullable
			FROM information_schema.columns
			WHERE table_schema = ${SCHEMA} AND table_name = 'event_sessions' AND column_name = 'service_id'
		`;
		expect(column[0].is_nullable).toBe('NO');

		await expect(client`
			INSERT INTO event_sessions (id, event_id, title_en, title_fr, start_time, end_time, total_capacity, available_capacity, price_amount, published)
			VALUES ('ccccccc0-0000-4000-8000-000000000009', ${eventA}, 'No Service', 'Sans Service', '2026-07-11T19:00:00Z', '2026-07-11T22:00:00Z', 10, 10, 1000, true)
		`).rejects.toThrow();

		const fk = await client`
			SELECT count(*)::int AS fks
			FROM information_schema.table_constraints
			WHERE table_schema = ${SCHEMA}
				AND table_name = 'event_sessions'
				AND constraint_type = 'FOREIGN KEY'
				AND constraint_name = 'event_sessions_service_id_event_services_id_fk'
		`;
		expect(fk[0].fks).toBe(1);
	});
});

// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from '../fixtures/database';

// ---------------------------------------------------------------------------
// Migration test for the Portfolio content migration (issue 045).
//
// Replays every migration before it inside an isolated schema of the shared
// test database (as event-visibility-migration.test.ts does), inserts Event,
// Talent and unlinked media, applies it and asserts that existing Event
// media become Visuals, other media get no role, one cover per Event is
// kept, and the Recap columns exist.
// ---------------------------------------------------------------------------

const SCHEMA = 'test_migration_portfolio_content';
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

const EVENT = '45454545-4545-4454-8454-454545454501';
const TALENT = '45454545-4545-4454-8454-454545454502';
const COVER = '45454545-4545-4454-8454-454545454511';
const STRAY_COVER = '45454545-4545-4454-8454-454545454512';
const GALLERY = '45454545-4545-4454-8454-454545454513';
const TALENT_MEDIA = '45454545-4545-4454-8454-454545454514';
const UNLINKED = '45454545-4545-4454-8454-454545454515';

let migrationFile = '';

async function insertMedia(id: string, owner: { eventId?: string; talentId?: string }, isCover: boolean, createdAt: string) {
	await client.unsafe(`
		INSERT INTO media (id, type, url, s3_key, mime_type, size, event_id, talent_id, is_cover, created_at)
		VALUES ('${id}', 'image', 'https://cdn.test/${id}.webp', 'test/${id}.webp', 'image/webp', 1000,
			${owner.eventId ? `'${owner.eventId}'` : 'NULL'}, ${owner.talentId ? `'${owner.talentId}'` : 'NULL'}, ${isCover}, '${createdAt}')
	`);
}

beforeAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`CREATE SCHEMA ${SCHEMA}`);
	await client.unsafe(`SET search_path TO ${SCHEMA}`);

	const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
	const tags: string[] = journal.entries.map((entry: { tag: string }) => entry.tag);
	const index = tags.findIndex((tag) => tag.endsWith('_portfolio_content'));
	expect(index).toBeGreaterThan(0);
	migrationFile = `${tags[index]}.sql`;
	for (const tag of tags.slice(0, index)) {
		await applyMigrationFile(`${tag}.sql`);
	}

	await client.unsafe(`INSERT INTO events (id, title_en, title_fr) VALUES ('${EVENT}', 'Dinner', 'Dîner')`);
	await client.unsafe(`
		INSERT INTO talents (id, first_name, last_name, role_en, role_fr, bio_en, bio_fr)
		VALUES ('${TALENT}', 'Ada', 'Lovelace', 'Chef', 'Cheffe', 'Bio', 'Bio')
	`);
	// Two covers on one Event: the Event's own cover_media_id wins.
	await insertMedia(STRAY_COVER, { eventId: EVENT }, true, '2026-01-01T00:00:00Z');
	await insertMedia(COVER, { eventId: EVENT }, true, '2026-01-02T00:00:00Z');
	await insertMedia(GALLERY, { eventId: EVENT }, false, '2026-01-03T00:00:00Z');
	await client.unsafe(`UPDATE events SET cover_media_id = '${COVER}' WHERE id = '${EVENT}'`);
	await insertMedia(TALENT_MEDIA, { talentId: TALENT }, true, '2026-01-04T00:00:00Z');
	await insertMedia(UNLINKED, {}, false, '2026-01-05T00:00:00Z');

	await applyMigrationFile(migrationFile);
});

afterAll(async () => {
	await client.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
	await client.unsafe(`SET search_path TO public`);
	await client.end({ timeout: 5 });
});

describe('migration — Portfolio content (issue 045)', () => {
	it('makes existing Event media Visuals and leaves other media without a role', async () => {
		const rows = await client.unsafe(`SELECT id, role FROM media ORDER BY created_at`);
		const roles = Object.fromEntries(rows.map((row) => [row.id, row.role]));
		expect(roles[STRAY_COVER]).toBe('visual');
		expect(roles[COVER]).toBe('visual');
		expect(roles[GALLERY]).toBe('visual');
		expect(roles[UNLINKED]).toBeNull();
		expect(roles[TALENT_MEDIA]).toBeNull();
	});

	it('keeps one cover per Event, preferring the Event’s own cover', async () => {
		const covers = await client.unsafe(`SELECT id FROM media WHERE event_id = '${EVENT}' AND is_cover`);
		expect(covers.map((row) => row.id)).toEqual([COVER]);
	});

	it('refuses a second cover in the same role, but not one per role', async () => {
		await expect(
			client.unsafe(`UPDATE media SET is_cover = true WHERE id = '${GALLERY}'`)
		).rejects.toThrow();
		await client.unsafe(`UPDATE media SET role = 'event_photo', is_cover = true WHERE id = '${GALLERY}'`);
		const covers = await client.unsafe(`SELECT role FROM media WHERE event_id = '${EVENT}' AND is_cover ORDER BY role`);
		expect(covers.map((row) => row.role)).toEqual(['visual', 'event_photo']);
	});

	it('adds the Recap in English and French, empty for existing Events', async () => {
		const [event] = await client.unsafe(`SELECT recap_en, recap_fr FROM events WHERE id = '${EVENT}'`);
		expect(event.recap_en).toBeNull();
		expect(event.recap_fr).toBeNull();
	});
});

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema';

export const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/germinal_test';

let _client: postgres.Sql | null = null;

export function getTestDatabase() {
	if (!_client) {
		_client = postgres(TEST_DATABASE_URL, { max: 5 });
	}
	return drizzle(_client, { schema });
}

export async function closeTestDatabase() {
	if (_client) {
		await _client.end();
		_client = null;
	}
}

export async function setupTestDatabase() {
	const db = getTestDatabase();
	await db.execute(sql`TRUNCATE TABLE reservations CASCADE`);
	await db.execute(sql`TRUNCATE TABLE payments CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_sessions CASCADE`);
	await db.execute(sql`TRUNCATE TABLE waitlist CASCADE`);
	await db.execute(sql`TRUNCATE TABLE promotion_codes CASCADE`);
	await db.execute(sql`TRUNCATE TABLE coupons CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_staff CASCADE`);
	await db.execute(sql`TRUNCATE TABLE tasks CASCADE`);
	await db.execute(sql`TRUNCATE TABLE email_queue CASCADE`);
	await db.execute(sql`TRUNCATE TABLE contact_submissions CASCADE`);
	await db.execute(sql`TRUNCATE TABLE media CASCADE`);
	await db.execute(sql`TRUNCATE TABLE talents CASCADE`);
	await db.execute(sql`TRUNCATE TABLE events CASCADE`);
	return db;
}

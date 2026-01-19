import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema';

export function getTestDatabase() {
	const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/germinal_test';
	const client = postgres(connectionString, {
		max: 5,
	});

	const db = drizzle(client, { schema });

	return db;
}

export async function setupTestDatabase() {
	const db = getTestDatabase();

	// Clean up database before tests
	await db.execute(sql`TRUNCATE TABLE reservations CASCADE`);
	await db.execute(sql`TRUNCATE TABLE payments CASCADE`);
	await db.execute(sql`TRUNCATE TABLE event_sessions CASCADE`);
	await db.execute(sql`TRUNCATE TABLE waitlist CASCADE`);
	await db.execute(sql`TRUNCATE TABLE email_queue CASCADE`);
	await db.execute(sql`TRUNCATE TABLE contact_submissions CASCADE`);
	await db.execute(sql`TRUNCATE TABLE media CASCADE`);
	await db.execute(sql`TRUNCATE TABLE talents CASCADE`);
	await db.execute(sql`TRUNCATE TABLE events CASCADE`);

	return db;
}

export async function cleanupTestDatabase(db: ReturnType<typeof getTestDatabase>) {
	// Database cleanup will be handled by the test framework
	// This is a placeholder for any specific cleanup logic
}

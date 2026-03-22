#!/usr/bin/env node
/**
 * Standalone database migration script.
 * Runs all pending Drizzle migrations against DATABASE_URL.
 * Used by the deployment process before starting the app.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

const migrationsFolder = resolve(__dirname, '../drizzle/migrations');

console.log('[migrate] Connecting to database...');
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

try {
  console.log('[migrate] Running pending migrations...');
  await migrate(db, { migrationsFolder });
  console.log('[migrate] ✅ Migrations complete');
} catch (err) {
  console.error('[migrate] ❌ Migration failed:', err);
  process.exit(1);
} finally {
  await client.end({ timeout: 5 });
}

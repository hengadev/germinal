#!/usr/bin/env node
/**
 * Standalone database migration script.
 * Runs all pending Drizzle migrations against DATABASE_URL.
 * Used by the deployment process before starting the app.
 *
 * Note: `ALTER TYPE ... ADD VALUE` cannot run inside a PostgreSQL transaction.
 * These statements are applied separately before Drizzle's transactional migrations.
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
  // Apply enum additions outside of transactions.
  // PostgreSQL does not allow ALTER TYPE ... ADD VALUE inside a transaction block,
  // so these must be run before Drizzle's transactional migration runner.
  console.log('[migrate] Applying enum additions...');
  await client.unsafe("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff'");
  console.log('[migrate] Enum additions applied');
} catch (err) {
  // If the enum type doesn't exist yet (fresh DB), this is fine — Drizzle will
  // create the type via the initial migration.
  if (!err.message?.includes('does not exist')) {
    console.error('[migrate] ❌ Failed to apply enum additions:', err.message);
    process.exit(1);
  }
}

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

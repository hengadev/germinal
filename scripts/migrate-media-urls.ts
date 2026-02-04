/**
 * Media URL Migration Script
 *
 * Migrates media URLs from S3 direct access to CloudFront.
 *
 * Usage:
 *   npx tsx scripts/migrate-media-urls.ts --dry-run    # Preview changes
 *   npx tsx scripts/migrate-media-urls.ts              # Execute migration
 *
 * Environment variables required:
 *   S3_PUBLIC_URL  - Old S3 URL base (e.g., https://bucket.s3.region.amazonaws.com)
 *   MEDIA_URL      - New CloudFront URL base (e.g., https://media.yourdomain.com)
 *   DATABASE_URL   - PostgreSQL connection string
 */

import 'dotenv/config';
import { db } from '../src/lib/server/db/index.js';
import { media } from '../src/lib/server/db/schema.js';
import { sql, like } from 'drizzle-orm';

const OLD_BASE = process.env.S3_PUBLIC_URL;
const NEW_BASE = process.env.MEDIA_URL;

async function migrate(dryRun: boolean) {
  console.log('🔄 Media URL Migration');
  console.log('========================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log(`Old base: ${OLD_BASE}`);
  console.log(`New base: ${NEW_BASE}`);
  console.log('');

  if (!OLD_BASE) {
    console.error('❌ S3_PUBLIC_URL is not set');
    process.exit(1);
  }

  if (!NEW_BASE) {
    console.error('❌ MEDIA_URL is not set');
    process.exit(1);
  }

  if (OLD_BASE === NEW_BASE) {
    console.error('❌ S3_PUBLIC_URL and MEDIA_URL are the same, nothing to migrate');
    process.exit(1);
  }

  try {
    // Count records to migrate
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(media)
      .where(like(media.url, `${OLD_BASE}%`));

    const totalCount = Number(countResult[0]?.count ?? 0);
    console.log(`📊 Found ${totalCount} media records to migrate`);

    if (totalCount === 0) {
      console.log('✅ No records need migration');
      process.exit(0);
    }

    if (dryRun) {
      // Show sample records
      const sampleRecords = await db
        .select({ id: media.id, url: media.url })
        .from(media)
        .where(like(media.url, `${OLD_BASE}%`))
        .limit(5);

      console.log('\n📋 Sample URLs to be migrated:');
      for (const record of sampleRecords) {
        const newUrl = record.url.replace(OLD_BASE, NEW_BASE);
        console.log(`  ${record.id}:`);
        console.log(`    Before: ${record.url}`);
        console.log(`    After:  ${newUrl}`);
      }

      if (totalCount > 5) {
        console.log(`  ... and ${totalCount - 5} more records`);
      }

      console.log('\n✅ Dry run complete. Run without --dry-run to execute migration.');
    } else {
      // Execute migration
      console.log('\n⏳ Executing migration...');

      const result = await db.execute(sql`
        UPDATE media
        SET url = REPLACE(url, ${OLD_BASE}, ${NEW_BASE})
        WHERE url LIKE ${OLD_BASE + '%'}
      `);

      const rowCount = (result as { rowCount?: number }).rowCount ?? totalCount;
      console.log(`\n✅ Migration complete! Updated ${rowCount} records.`);

      // Verify migration
      const remaining = await db
        .select({ count: sql<number>`count(*)` })
        .from(media)
        .where(like(media.url, `${OLD_BASE}%`));

      const remainingCount = Number(remaining[0]?.count ?? 0);
      if (remainingCount > 0) {
        console.warn(`⚠️  Warning: ${remainingCount} records still have old URLs`);
      } else {
        console.log('✅ Verification passed: No records with old URLs remaining');
      }
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Parse command line arguments
const dryRun = process.argv.includes('--dry-run');
migrate(dryRun);

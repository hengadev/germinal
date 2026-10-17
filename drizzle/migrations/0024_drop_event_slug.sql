ALTER TABLE "events" DROP CONSTRAINT "events_slug_unique";--> statement-breakpoint
DROP INDEX "events_slug_idx";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "slug";
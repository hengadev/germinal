CREATE TYPE "public"."event_visibility" AS ENUM('draft', 'private', 'public');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visibility" "event_visibility" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
-- Issue 032 (ADR 0007): published Events become Public, the others Draft.
UPDATE "events" SET "visibility" = 'public' WHERE "published" = true;--> statement-breakpoint
-- Only a Public Event may be the Spotlight.
UPDATE "events" SET "is_spotlight" = false WHERE "visibility" <> 'public' AND "is_spotlight" = true;--> statement-breakpoint
DROP INDEX "events_published_idx";--> statement-breakpoint
DROP INDEX "events_published_start_date_idx";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "published";--> statement-breakpoint
CREATE INDEX "events_visibility_idx" ON "events" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "events_visibility_start_date_idx" ON "events" USING btree ("visibility","start_date");

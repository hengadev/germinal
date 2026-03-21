CREATE TYPE "public"."badge_type" AS ENUM('none', 'featured', 'vip', 'popular', 'best_value', 'limited');--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_event_or_talent_check";--> statement-breakpoint
ALTER TABLE "event_sessions" ADD COLUMN "badge_type" "badge_type" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_entity_mutual_exclusion_check" CHECK (NOT (event_id IS NOT NULL AND talent_id IS NOT NULL));
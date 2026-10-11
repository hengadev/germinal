ALTER TABLE "events" DROP CONSTRAINT "events_category_id_event_categories_id_fk";--> statement-breakpoint
DROP INDEX "events_category_idx";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "category_id";--> statement-breakpoint
DROP TABLE "event_categories";

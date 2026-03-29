ALTER TABLE "event_sessions" ADD COLUMN "title_en" varchar(255);
ALTER TABLE "event_sessions" ADD COLUMN "title_fr" varchar(255);
ALTER TABLE "event_sessions" ADD COLUMN "description_en" text;
ALTER TABLE "event_sessions" ADD COLUMN "description_fr" text;
--> statement-breakpoint
UPDATE "event_sessions" SET
  "title_en" = "title",
  "title_fr" = "title",
  "description_en" = "description",
  "description_fr" = "description";
--> statement-breakpoint
ALTER TABLE "event_sessions" ALTER COLUMN "title_en" SET NOT NULL;
ALTER TABLE "event_sessions" ALTER COLUMN "title_fr" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_sessions" DROP COLUMN IF EXISTS "title";
ALTER TABLE "event_sessions" DROP COLUMN IF EXISTS "description";

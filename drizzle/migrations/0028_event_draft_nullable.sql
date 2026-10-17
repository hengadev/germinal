ALTER TABLE "events" ALTER COLUMN "title_en" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "title_fr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "description_en" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "description_fr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "end_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "location_en" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "location_fr" DROP NOT NULL;
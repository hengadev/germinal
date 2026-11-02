ALTER TABLE "events" ADD COLUMN "thank_you_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "thank_you_message_en" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "thank_you_message_fr" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "thank_you_link_url" varchar(500);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "thank_you_link_label_en" varchar(200);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "thank_you_link_label_fr" varchar(200);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "thank_you_sent_at" timestamp with time zone;
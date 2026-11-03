CREATE TYPE "public"."request_status" AS ENUM('new', 'discussing', 'quote_sent', 'confirmed', 'lost');--> statement-breakpoint
ALTER TYPE "public"."inquiry_type" ADD VALUE 'private_event' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "occasion" varchar(255);--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "preferred_dates" text;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "guest_count" integer;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "budget" varchar(255);--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "status" "request_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_submissions_status_idx" ON "contact_submissions" USING btree ("status");
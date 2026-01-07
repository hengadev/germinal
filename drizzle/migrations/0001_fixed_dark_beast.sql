CREATE TYPE "public"."inquiry_type" AS ENUM('collaboration', 'new_project', 'join_roster', 'other');--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"company" varchar(255),
	"inquiry_type" "inquiry_type" NOT NULL,
	"message" text NOT NULL,
	"honeypot" varchar(100),
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp with time zone,
	"email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venue_name" varchar(200);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "street_address" varchar(255);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "district" varchar(100);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "postal_code" varchar(20);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "country" varchar(100);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "collaborators" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "timings" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "curator" varchar(150);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "materials" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "admission_info" varchar(150);--> statement-breakpoint
ALTER TABLE "talents" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "talents" ADD COLUMN "country" varchar(100);--> statement-breakpoint
ALTER TABLE "talents" ADD COLUMN "quote" text;--> statement-breakpoint
ALTER TABLE "talents" ADD COLUMN "specializations" text;--> statement-breakpoint
CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_submissions_inquiry_type_idx" ON "contact_submissions" USING btree ("inquiry_type");--> statement-breakpoint
CREATE INDEX "contact_submissions_email_sent_idx" ON "contact_submissions" USING btree ("email_sent");
ALTER TABLE "events" ADD COLUMN "ask_dietary_requirements" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "dietary_requirements" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "dietary_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_dietary_consent_check" CHECK (dietary_requirements IS NULL OR dietary_consent_at IS NOT NULL);